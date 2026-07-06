/**
 * ledController.js
 * Lumee 날씨 데이터를 아두이노 LED 제어 신호로 변환 (소리 제어 포함)
 */

// LED 상태 및 소리 ID 우선순위 결정 함수
function determineLEDStatus(weatherData) {
  const { 
    temperature, 
    feelsLike, 
    pm10, 
    pm25, 
    ozone, 
    uvIndex, 
    pollen, 
    precipitation, 
    weather, 
    clouds, 
    humidity 
  } = weatherData;

  /* * [소리 파일 매핑 참고 (SD카드 01 폴더)]
   * 001.mp3 : 매미 (폭염)
   * 002.mp3 : 눈 밟는 소리 (한파/눈/추움)
   * 003.mp3 : 천둥번개
   * 004.mp3 : 폭우
   * 005.mp3 : 빗소리 (보통 비)
   * 006.mp3 : 바람 소리 (흐림/건조)
   * 007.mp3 : 경고음 (미세먼지/안개)
   * 008.mp3 : 새소리 (맑음/쾌적)
   * 009.mp3 : 물방울 (습함)
   * 010.mp3 : 맑은 효과음 (완벽한 날씨/기동음)
   * 011.mp3 : 꽃가루 경고
   */

  // 1순위: 긴급 경보 (1, 2번 소리)
  if (feelsLike >= 35) {
    return {
      priority: 1,
      color: { r: 255, g: 0, b: 0 },
      effect: "fast_blink",
      duration: 500,
      soundId: 1, // 매미소리 (001.mp3)
      message: "폭염 경보: 외출을 자제하세요"
    };
  }

  if (feelsLike <= -15) {
    return {
      priority: 1,
      color: { r: 0, g: 100, b: 255 },
      effect: "fast_blink",
      duration: 500,
      soundId: 2, // 눈 밟는 소리 (002.mp3)
      message: "한파 경보: 체온 유지에 주의하세요"
    };
  }

  if (pm25 > 75) {
    return {
      priority: 1,
      color: { r: 148, g: 0, b: 211 },
      effect: "slow_blink",
      duration: 1000,
      soundId: 7, // 경고음 (007.mp3)
      message: "초미세먼지 매우나쁨: 외출 시 KF94 마스크 필수"
    };
  }

  // 2순위: 대기질 경고
  if (pm10 > 150) {
    return {
      priority: 2,
      color: { r: 139, g: 0, b: 0 },
      effect: "slow_blink",
      duration: 2000,
      soundId: 7, 
      message: "미세먼지 매우나쁨: 실외활동 자제"
    };
  }

  if (pm10 > 80) {
    return {
      priority: 2,
      color: { r: 255, g: 140, b: 0 },
      effect: "solid",
      duration: 0,
      soundId: 7,
      message: "미세먼지 나쁨: 마스크 착용 권장"
    };
  }

  if (pm10 > 50) {
    return {
      priority: 2,
      color: { r: 255, g: 215, b: 0 },
      effect: "solid",
      duration: 0,
      soundId: 7,
      message: "미세먼지 보통: 민감군 주의"
    };
  }

  if (pm25 > 35) {
    return {
      priority: 2,
      color: { r: 255, g: 165, b: 0 },
      effect: "solid",
      duration: 0,
      soundId: 7,
      message: "초미세먼지 나쁨: 호흡기 민감자 주의"
    };
  }

  if (ozone > 0.12) {
    return {
      priority: 2,
      color: { r: 173, g: 255, b: 47 },
      effect: "slow_blink",
      duration: 2000,
      soundId: 7,
      message: "오존 농도 높음: 실외활동 자제"
    };
  }

  // 3순위: 날씨 상태 (3~6번 소리)
  if (weather === "Thunderstorm") {
    return {
      priority: 3,
      color: { r: 255, g: 255, b: 0 },
      effect: "lightning",
      duration: 0,
      soundId: 3, // 천둥번개 (003.mp3)
      message: "천둥번개: 실내 대피 권장"
    };
  }

  if (precipitation > 30) {
    return {
      priority: 3,
      color: { r: 0, g: 0, b: 139 },
      effect: "fast_blink",
      duration: 500,
      soundId: 4, // 폭우 (004.mp3)
      message: "폭우: 이동 자제"
    };
  }

  if (precipitation > 10) {
    return {
      priority: 3,
      color: { r: 30, g: 144, b: 255 },
      effect: "rain",
      duration: 0,
      soundId: 5, // 빗소리 (005.mp3)
      message: "강한 비: 우산 필수"
    };
  }

  if (precipitation > 2) {
    return {
      priority: 3,
      color: { r: 100, g: 149, b: 237 },
      effect: "slow_blink",
      duration: 2000,
      soundId: 5,
      message: "보통 비: 우산 권장"
    };
  }

  if (precipitation > 0) {
    return {
      priority: 3,
      color: { r: 135, g: 206, b: 250 },
      effect: "slow_blink",
      duration: 3000,
      soundId: 5,
      message: "약한 비: 접이식 우산 휴대"
    };
  }

  if (weather === "Snow") {
    return {
      priority: 3,
      color: { r: 255, g: 250, b: 250 },
      effect: "sparkle",
      duration: 0,
      soundId: 2, // 눈 밟는 소리
      message: "눈: 미끄럼 주의"
    };
  }

  if (weather === "Mist" || weather === "Fog") {
    return {
      priority: 3,
      color: { r: 192, g: 192, b: 192 },
      effect: "breathe",
      duration: 2000,
      soundId: 7, // 안개 경고음
      message: "안개: 운전 주의"
    };
  }

  if (clouds > 80) {
    return {
      priority: 3,
      color: { r: 169, g: 169, b: 169 },
      effect: "solid",
      duration: 0,
      soundId: 6, // 흐림/바람 소리 (006.mp3)
      message: "흐림"
    };
  }

  if (clouds > 20) {
    return {
      priority: 3,
      color: { r: 176, g: 224, b: 230 },
      effect: "solid",
      duration: 0,
      soundId: 7,
      message: "구름 조금"
    };
  }

  // 4순위: 특수 상황 (9, 11번 소리)
  if (uvIndex > 8) {
    return {
      priority: 4,
      color: { r: 186, g: 85, b: 211 },
      effect: "pulse",
      duration: 2000,
      soundId: 1, // 자외선 높음 -> 매미 소리
      message: "자외선 매우 높음: 자외선 차단제 필수"
    };
  }

  if (pollen > 9) {
    return {
      priority: 4,
      color: { r: 255, g: 192, b: 203 },
      effect: "breathe",
      duration: 2000,
      soundId: 11, // 꽃가루 경고 (011.mp3)
      message: "꽃가루 많음: 알레르기 약 복용 권장"
    };
  }

  if (humidity > 80) {
    return {
      priority: 4,
      color: { r: 64, g: 224, b: 208 },
      effect: "wave",
      duration: 0,
      soundId: 9, // 습도/물방울 소리 (009.mp3)
      message: "습도 매우 높음: 불쾌지수 높음"
    };
  }

  if (humidity < 30) {
    return {
      priority: 4,
      color: { r: 210, g: 180, b: 140 },
      effect: "solid",
      duration: 0,
      soundId: 6,
      message: "습도 매우 낮음: 보습 필요"
    };
  }

  // 5순위: 온도 기반 표시 (8번 소리: 쾌적/맑음)
  if (temperature >= 30) {
    return {
      priority: 5,
      color: { r: 255, g: 69, b: 0 },
      effect: "solid",
      duration: 0,
      soundId: 1, // 매미
      message: "매우 더움"
    };
  }

  if (temperature >= 25) {
    return {
      priority: 5,
      color: { r: 255, g: 140, b: 0 },
      effect: "solid",
      duration: 0,
      soundId: 1,
      message: "더움"
    };
  }

  if (temperature >= 18) {
    return {
      priority: 5,
      color: { r: 50, g: 205, b: 50 },
      effect: "solid",
      duration: 0,
      soundId: 8, // 맑음/새소리 (008.mp3)
      message: "쾌적"
    };
  }

  if (temperature >= 10) {
    return {
      priority: 5,
      color: { r: 144, g: 238, b: 144 },
      effect: "solid",
      duration: 0,
      soundId: 8,
      message: "선선"
    };
  }

  if (temperature >= 0) {
    return {
      priority: 5,
      color: { r: 70, g: 130, b: 180 },
      effect: "solid",
      duration: 0,
      soundId: 2, // 눈/바람 소리
      message: "추움"
    };
  }

  if (temperature < 0) {
    return {
      priority: 5,
      color: { r: 0, g: 191, b: 255 },
      effect: "solid",
      duration: 0,
      soundId: 2,
      message: "매우 추움"
    };
  }

  // 기본값: 완벽한 날씨 (10번 소리)
  return {
    priority: 5,
    color: { r: 135, g: 206, b: 235 },
    effect: "gradient",
    duration: 5000,
    soundId: 10, // 완벽한 날씨 (010.mp3)
    message: "완벽한 날씨: 외출하기 좋습니다"
  };
}

// 사용자 맞춤 LED 밝기 조정 (기존 유지)
function adjustBrightnessForUser(ledStatus, userProfile) {
  if (!userProfile || !userProfile.sensitiveFactors) {
    return ledStatus;
  }

  const { sensitiveFactors } = userProfile;
  let brightnessBoost = 0;

  if (sensitiveFactors.includes('respiratory') && 
      (ledStatus.message.includes('미세먼지') || ledStatus.message.includes('오존'))) {
    brightnessBoost = 30;
  }

  if (sensitiveFactors.includes('skin') && 
      ledStatus.message.includes('자외선')) {
    brightnessBoost = 30;
  }

  if (sensitiveFactors.includes('allergy') && 
      ledStatus.message.includes('꽃가루')) {
    brightnessBoost = 30;
  }

  if (sensitiveFactors.includes('cold') && 
      ledStatus.message.includes('추움')) {
    brightnessBoost = 30;
  }

  ledStatus.brightnessBoost = brightnessBoost;
  return ledStatus;
}

// Express 라우터 설정
function setupLEDRoutes(app) {
  // LED 상태 조회 엔드포인트
  app.post('/api/led/status', async (req, res) => {
    try {
      const { weatherData, userProfile } = req.body;

      // LED 상태 결정
      let ledStatus = determineLEDStatus(weatherData);

      // 사용자 맞춤 조정
      if (userProfile) {
        ledStatus = adjustBrightnessForUser(ledStatus, userProfile);
      }

      // 응답
      res.json({
        success: true,
        ledStatus,
        weatherData
      });

    } catch (error) {
      console.error('LED status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 블루투스 전송용 엔드포인트
  app.post('/api/led/bluetooth', async (req, res) => {
    try {
      const { weatherData } = req.body;
      const ledStatus = determineLEDStatus(weatherData);

      // 아두이노로 전송할 JSON 포맷
      // 🔥 's' 키를 통해 soundId를 전송합니다!
      const bluetoothData = {
        r: ledStatus.color.r,
        g: ledStatus.color.g,
        b: ledStatus.color.b,
        effect: ledStatus.effect,
        duration: ledStatus.duration,
        priority: ledStatus.priority,
        s: ledStatus.soundId // 🔊 소리 ID 전송 (추가됨)
      };

      res.json({
        success: true,
        bluetoothData,
        message: ledStatus.message
      });

    } catch (error) {
      console.error('Bluetooth data error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = {
  determineLEDStatus,
  adjustBrightnessForUser,
  setupLEDRoutes
};