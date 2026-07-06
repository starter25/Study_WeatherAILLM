const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeather } = require('./weatherUtils');
const { getAirQuality, getPollenAmbee } = require('./airPollenUtils');
const { extractLocationFromText } = require('./placeExtractor');
const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
const { extractScheduleContext } = require('./scheduleLocationExtractor');

/**
 * @fileoverview Gemini API에 제공할 "도구(Tool)"를 정의하고,
 * Gemini의 요청에 따라 해당 도구를 실행하는 로직을 담당합니다.
 * 이 파일은 새로운 LLM 기반 아키텍처의 핵심 중 하나입니다.
 */

// 날짜 객체를 YYYY-MM-DD 문자열로 변환하는 헬퍼 함수 (로컬 시간 기준)
function getYYYYMMDD(date) {
  if (!date || isNaN(date.getTime())) return 'Invalid Date';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const availableTools = {
  functionDeclarations: [
    {
      name: 'get_full_weather_with_context',
      description: "날씨 정보를 조회하는 가장 기본적인 도구입니다. 사용자의 질문과 민감요소, 취미를 고려해 종합적인 날씨 정보를 조회합니다.",
      parameters: {
        type: 'OBJECT',
        properties: {
          location: {
            type: 'STRING',
            description: "지역명 (예: '서울'). 명시되지 않은 경우 'CURRENT_LOCATION'으로 설정하세요."
          },
          date: {
            type: 'STRING',
            description: "조회 날짜 (예: 오늘, 내일, 12월 16일). 지정하지 않으면 오늘"
          },
          graph_needed: {
            type: 'BOOLEAN',
            description: "사용자가 '기온', '그래프' 같은 표현을 썼을 때 true로 설정하세요."
          },
          user_input: {
            type: 'STRING',
            description: '사용자의 원문 질문 텍스트'
          }
        },
        required: ['location', 'user_input']
      }
    }
  ]
};

async function executeTool(functionCall, userCoords, userProfile) {
    console.log('\n🔧 executeTool 시작');
    const { name, args } = functionCall;
    
    if (name !== 'get_full_weather_with_context') throw new Error('정의되지 않은 도구입니다.');

    const userInput = args.user_input?.toLowerCase() || '';
    console.log(`👤 사용자 입력: "${userInput}"`);

    // 1. 날짜 추출
    let requestedDate;
    
    if (args.date) {
      const tempDate = new Date(args.date);
      if (!isNaN(tempDate.getTime())) {
        requestedDate = tempDate;
      } else {
        console.log(`⚠️ args.date(${args.date}) 파싱 실패 -> extractDateFromText 시도`);
        requestedDate = extractDateFromText(args.date);
      }
    }

    if (!requestedDate || isNaN(requestedDate.getTime())) {
      requestedDate = extractDateFromText(userInput);
    }

    if (!requestedDate || isNaN(requestedDate.getTime())) {
      console.warn('⚠️ 날짜 파싱 실패하여 오늘 날짜로 대체합니다.');
      requestedDate = new Date();
    }

    const dateKey = getYYYYMMDD(requestedDate);
    console.log(`📅 요청 날짜: ${dateKey} (원본: ${args.date || '없음'})`);

    // 2. 🔥 일정에서 지역 추출 시도 (userProfile이 전달되었는지 확인)
    let scheduleLocation = null;
    let targetLocation = args.location || 'CURRENT_LOCATION';

    if (userProfile && userProfile.schedule && (args.location.toUpperCase() === 'CURRENT_LOCATION' || args.location === '현재 위치')) {
      console.log('\n🗓️ 일정에서 지역 추출 시도...');
      
      try {
        // 🔥 일정 및 위치 추출 (날짜 매칭 포함)
        const location = require('./scheduleLocationExtractor').getLocationFromSchedule(userProfile, requestedDate);

        if (location) {
          console.log(`✅ 일정 기반 지역 발견: "${location}"`);
          console.log(`📍 일정 지역으로 변경: ${targetLocation} -> ${location}`);
          targetLocation = location; 
          scheduleLocation = location;
        } else {
          console.log('❌ 해당 날짜의 일정에서 지역 정보를 찾지 못했습니다.');
        }
      } catch (error) {
        console.error('❌ 일정 추출 중 오류:', error.message);
      }
    } else {
      if (!userProfile) console.log('⚠️ userProfile이 전달되지 않아 일정 확인을 건너뜁니다.');
      else if (!userProfile.schedule) console.log('⚠️ 일정이 없어 확인을 건너뜁니다.');
    }

    // 3. 좌표 검색 및 날씨 조회
    let lat, lon, locationName;
    console.log(`\n🌍 최종 타겟 지역: "${targetLocation}"`);

    if (targetLocation.toUpperCase() === 'CURRENT_LOCATION' || targetLocation === '현재 위치') {
      if (!userCoords) throw new Error('현재 위치가 제공되지 않았습니다.');
      lat = userCoords.latitude;
      lon = userCoords.longitude;
      
      try {
        locationName = await reverseGeocode(lat, lon);
        console.log('📍 현재 위치 사용:', locationName);
      } catch (error) {
        locationName = '현재 위치';
      }
    } else {
      console.log(`🔍 지역 검색 시도: ${targetLocation}`);
      const geo = await geocodeGoogle(targetLocation);
      
      if (!geo) {
        console.warn(`⚠️ '${targetLocation}' 검색 실패. 현재 위치로 대체.`);
        if (userCoords) {
          lat = userCoords.latitude;
          lon = userCoords.longitude;
          locationName = await reverseGeocode(lat, lon);
        } else {
          throw new Error(`'${targetLocation}'의 좌표를 찾을 수 없습니다.`);
        }
      } else {
        lat = geo.lat;
        lon = geo.lon;
        locationName = targetLocation;
        console.log(`✅ 좌표 검색 성공: ${locationName} (${lat}, ${lon})`);
      }
    }

    // 5. 날씨/대기질/꽃가루 데이터 조회
    const [weather, air, pollen] = await Promise.all([
      getWeather(lat, lon),
      getAirQuality(lat, lon),
      getPollenAmbee(lat, lon)
    ]);

    // 6. 그래프 필요 여부 판단
    const includeGraph =
      args.graph_needed ||
      userInput.includes('온도') || userInput.includes('기온') ||
      userInput.includes('그래프') || userInput.includes('temperature') || 
      userInput.includes('temp') || userInput.includes('graph') ||
      userInput.includes('뭐 입을까') || userInput.includes('뭐 입지') ||        
      userInput.includes('옷') || userInput.includes('코디') ||
      userInput.includes('what should i wear') || userInput.includes('clothing');

    const hourlyTemps = [];
    
    if (weather?.hourly && includeGraph) {
      const hourly = weather.hourly;
      const offsetMs = (weather.timezone_offset || 0) * 1000;
      const localNow = new Date(Date.now() + offsetMs);
      localNow.setMinutes(0, 0, 0);

      for (let i = 0; i < 6; i++) {
        const targetLocalTime = new Date(localNow.getTime() + i * 3 * 3600000);
        const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
        const closest = hourly.reduce((prev, curr) =>
          Math.abs(curr.dt * 1000 - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev
        );
        const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
        const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
        hourlyTemps.push({ hour: label, temp: Math.round(closest.temp) });
      }
    }

    // 7. 응답 포맷팅
    const formattedDate = requestedDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    return {
      tool_function_name: 'get_full_weather_with_context',
      output: {
        location: locationName, 
        date: formattedDate, 
        weather,
        air,
        pollen,
        hourlyTemps
      }
    };
}

module.exports = {
  availableTools,
  executeTool
};