require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
// [추가됨] 시리얼 통신 모듈
const { SerialPort } = require('serialport');

// 라즈베리파이 통신을 위한 모듈
const { WebSocketServer } = require('ws');

// 라우트 파일 임포트
const cameraRoutes = require('./cameraRoutes');

// 서버 시작 시 API 키 확인 (테스트)
console.log('=== API 키 상태 확인 ===');
console.log('Gemini API 키:', process.env.GEMINI_API_KEY ? '있음' : '없음');
console.log('OpenWeather API 키:', process.env.OPENWEATHER_API_KEY ? '있음' : '없음');
console.log('Ambee API 키:', process.env.AMBEE_POLLEN_API_KEY ? '있음' : '없음');

// Module import
const { getUserProfile } = require('./userProfileUtils');
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeatherByCoords } = require('./weatherUtils'); // 홈 화면 날씨 표시에 사용
const conversationStore = require('./conversationStore');
const { callGeminiForToolSelection, callGeminiForFinalResponse } = require('./geminiUtils');
const { availableTools, executeTool } = require('./tools');
// 🔥 LED 컨트롤러 함수
const { setupLEDRoutes, determineLEDStatus, adjustBrightnessForUser } = require('./ledController');

// 프론트엔드와 연결을 위한 상수
const corsOptions = {
  origin: '*',
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization'
};

const app = express();
const PORT = 4000;

// 미들웨어 설정
app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// 라우트 등록
app.use('/camera', cameraRoutes);

// 🎬 정적 파일 서빙 (날씨 영상용)
app.use('/static', express.static('public'));

// ✅ 필수 API 키
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Express 앱을 기반으로 HTTP 서버 생성 (웹소켓용)
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log('--- Lumee 백엔드 서버 시작 ---');

// LED 라우트 설정
setupLEDRoutes(app);

// 🔥🔥🔥 [소리 전용] 아두이노 COM3 연결 설정 🔥🔥🔥 **기기마다 COM번호가 다를 수 있음**
let soundSerial = null;
try {
  soundSerial = new SerialPort({
    path: 'COM3', // 소리 전용 아두이노 포트
    baudRate: 9600
  });

  soundSerial.on('open', () => {
    console.log('🔊 Sound Arduino connected on COM14');
  });

  soundSerial.on('error', (err) => {
    console.error('⚠️ Sound Arduino Error:', err.message);
  });
} catch (e) {
  console.log('⚠️ COM3 port not found. Sound disabled.');
}

// ---------------------------------------------------------

// 라즈베리파이 노크 신호 처리
app.post('/knock', (req, res) => {
  console.log('[HTTP] ✊ 라즈베리파이로부터 "KNOCK" 신호 수신!');
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send('KNOCK');
    }
  });
  res.status(200).send('OK');
});

// 채팅 제목 자동 생성 API
app.post('/generate-title', async (req, res) => {
  try {
    res.json({ title: 'New Weather Chat' });
  } catch (err) {
    res.json({ title: 'Weather Chat' });
  }
});

// 🔥 [필수 함수] 날씨 ID를 문자열 조건으로 변환
function mapWeatherIdToCondition(id) {
  if (id >= 200 && id < 300) return "Thunderstorm";
  if (id >= 300 && id < 500) return "Drizzle";
  if (id >= 500 && id < 600) return "Rain";
  if (id >= 600 && id < 700) return "Snow";
  if (id >= 700 && id < 800) return "Mist";
  if (id === 800) return "Clear";
  if (id > 800) return "Clouds";
  return "Clear";
}

// 🎬 [날씨 영상] 날씨 조건에 따른 영상 URL 반환
function getWeatherVideoUrl(weatherCondition) {
  const baseUrl = 'http://localhost:4000'; // 백엔드 서버 주소

  const videoMap = {
    'Rain': `${baseUrl}/static/videos/rain.html`,
    'Snow': `${baseUrl}/static/videos/snow.html`,
    'Mist': `${baseUrl}/static/videos/mist.html`,        // HTML wrapper 사용
    'Clear': `${baseUrl}/static/videos/clear.html`,
    'Clouds': `${baseUrl}/static/videos/clouds.html`,    // HTML wrapper 사용
    // Thunderstorm과 Drizzle은 제외됨 - Clear로 대체
    'Thunderstorm': `${baseUrl}/static/videos/clear.html`,
    'Drizzle': `${baseUrl}/static/videos/rain.html`
  };

  return videoMap[weatherCondition] || `${baseUrl}/static/videos/clear.html`;
}

// ✨ LLM 중심 채팅 엔드포인트 ✨
app.post('/chat', async (req, res) => {
  const { userInput, coords, uid } = req.body;
  console.log(`💬 사용자 질문 (UID: ${uid}):`, userInput);
  conversationStore.addUserMessage(userInput);

  try {
    // 1. 사용자 프로필 로드
    const userProfile = await getUserProfile(uid);

    // 2. 도구 선택
    const toolSelectionResponse = await callGeminiForToolSelection(userInput, availableTools);
    let functionCalls = toolSelectionResponse.candidates?.[0]?.content?.parts
      .filter(p => p.functionCall)
      .map(p => p.functionCall);

    if (!functionCalls) functionCalls = [];

    functionCalls = functionCalls.map(call => ({
      ...call,
      args: { ...call.args, user_input: userInput }
    }));

    // 3. 도구 실행
    const executionPromises = functionCalls.map(call => executeTool(call, coords, userProfile));
    const results = await Promise.allSettled(executionPromises);
    const toolOutputs = results.filter(r => r.status === 'fulfilled').map(r => r.value);

    // 4. 최종 Gemini 응답
    const finalResponse = await callGeminiForFinalResponse(
      userInput,
      toolSelectionResponse,
      toolOutputs,
      userProfile,
      functionCalls
    );

    const reply = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 답변 생성에 실패했어요.';
    const responsePayload = { reply };

    // 5. LED 및 소리 제어 로직
    const fullWeather = toolOutputs.find(o => o.tool_function_name === 'get_full_weather_with_context');

    if (fullWeather && fullWeather.output) {
      const w = fullWeather.output.weather || {};
      const a = fullWeather.output.air || {};
      const p = fullWeather.output.pollen || {};

      const mappedWeatherData = {
        temperature: w.temp,
        feelsLike: w.feelsLike,
        pm10: a.pm10 || 0,
        pm25: a.pm25 || 0,
        ozone: 0,
        uvIndex: w.uvi || 0,
        pollen: p.count || 0,
        precipitation: w.rain_1h || 0,
        weather: mapWeatherIdToCondition(w.weatherId), // 함수 사용
        clouds: w.clouds || 0,
        humidity: w.humidity || 0
      };

      // LED 상태 결정
      let ledStatus = determineLEDStatus(mappedWeatherData);

      if (userProfile) {
        ledStatus = adjustBrightnessForUser(ledStatus, userProfile);
      }

      // 🔥 [소리 출력] COM3 아두이노로 명령 전송
      if (soundSerial && soundSerial.isOpen && ledStatus.soundId) {
        soundSerial.write(ledStatus.soundId.toString());
        console.log(`🔊 Sent sound command to COM3: ${ledStatus.soundId}`);
      }

      responsePayload.ledStatus = {
        r: ledStatus.color.r,
        g: ledStatus.color.g,
        b: ledStatus.color.b,
        effect: ledStatus.effect,
        duration: ledStatus.duration,
        priority: ledStatus.priority,
        message: ledStatus.message,
        s: ledStatus.soundId
      };

      // 🎬 [날씨 영상] 날씨 조건에 따른 영상 URL 추가
      const weatherCondition = mappedWeatherData.weather;
      const videoUrl = getWeatherVideoUrl(weatherCondition);
      responsePayload.videoUrl = videoUrl;
      console.log(`🎬 Weather video URL: ${videoUrl} (condition: ${weatherCondition})`);
    }

    // 그래프 및 미세먼지 정보 추가
    const lowerInput = userInput.toLowerCase();

    // (1) 그래프 데이터
    if (['기온', '온도', '그래프', 'temp', 'what to wear', 'outfit'].some(k => lowerInput.includes(k))) {
      if (fullWeather?.output?.hourlyTemps?.length > 0) {
        responsePayload.graph = fullWeather.output.hourlyTemps;
        responsePayload.graphDate = fullWeather.output.date;
      }
    }

    // (2) 미세먼지 데이터
    if (['미세먼지', '먼지', '마스크', 'dust', 'air quality'].some(k => lowerInput.includes(k))) {
      if (fullWeather?.output?.air?.pm25 !== undefined) {
        const pm25 = fullWeather.output.air.pm25;
        const getAirLevel = v => v <= 15 ? 'Good' : v <= 35 ? 'Moderate' : v <= 75 ? 'Poor' : 'Very Poor';
        responsePayload.dust = {
          value: pm25,
          level: getAirLevel(pm25),
          date: fullWeather.output.date
        };
      }
    }

    res.json(responsePayload);

  } catch (err) {
    console.error('❌ /chat 처리 오류:', err.message);
    res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
  }
});

// 주소 변환 API
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const region = await reverseGeocode(latitude, longitude);
    res.json({ region });
  } catch (err) {
    res.status(500).json({ error: '주소 변환 실패' });
  }
});

// 날씨 API
app.post('/weather', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const weather = await getWeatherByCoords(latitude, longitude);
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: '날씨 정보 실패' });
  }
});

// 그래프용 날씨 API
app.post('/weather-graph', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
    const result = await axios.get(url);
    const data = result.data;

    const hourly = data.hourly;
    const offsetMs = (data.timezone_offset || 0) * 1000;
    const localNow = new Date(new Date().getTime() + offsetMs);
    localNow.setMinutes(0, 0, 0);

    const hourlyTemps = [];
    for (let i = 0; i < 6; i++) {
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);

      // 가장 가까운 시간 찾기
      const closest = hourly.reduce((prev, curr) => {
        const currTime = curr.dt * 1000;
        return Math.abs(currTime - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev;
      });

      const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
      const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;

      hourlyTemps.push({
        hour: label,
        temp: Math.round(closest.temp)
      });
    }

    res.json({ hourlyTemps });

  } catch (err) {
    res.status(500).json({ error: '그래프 데이터 실패' });
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] API 서버가 ${PORT} 포트에서 실행 중입니다.`);
  console.log(`[웹소켓] 통신 서버가 ${PORT} 포트에서 함께 실행 중입니다.`);
});