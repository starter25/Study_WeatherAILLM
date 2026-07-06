// scheduleLocationExtractor.js
const { extractDateFromText } = require('./timeUtils');

/**
 * 일정 텍스트에서 지역명을 추출하는 함수
 * @param {string} scheduleText - 일정 텍스트 (예: "2025-12-16: 성수 카페 탐방")
 * @returns {string|null} - 추출된 지역명 또는 null
 */
function extractLocationFromSchedule(scheduleText) {
  // 주요 한국 지역명 목록 (필요에 따라 확장 가능)
  const locationKeywords = [
    // 서울 지역구 및 주요 명소
    '강남', '강북', '강서', '강동', '관악', '광진', '구로', '금천', '노원',
    '도봉', '동대문', '동작', '마포', '서대문', '서초', '성동', '성북', '송파',
    '양천', '영등포', '용산', '은평', '종로', '중구', '중랑',
    '성수', '홍대', '신촌', '이태원', '명동', '잠실', '여의도', '압구정', '청담',
    
    // 광역시
    '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    
    // 경기도
    '수원', '성남', '고양', '용인', '부천', '안산', '안양', '남양주', '화성',
    '평택', '의정부', '시흥', '파주', '김포', '광명', '광주', '군포', '오산',
    '이천', '양주', '안성', '구리', '포천', '의왕', '하남', '여주', '동두천',
    '과천', '가평', '양평', '연천',
    
    // 강원도
    '춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '홍천', '횡성', '영월', '평창', '정선', '철원', '화천', '양구', '인제', '고성', '양양', '설악산', '경포대',
    
    // 충청도
    '천안', '청주', '공주', '보령', '아산', '서산', '논산', '계룡', '당진', '금산', '부여', '서천', '청양', '홍성', '예산', '태안', '충주', '제천', '단양', '음성', '진천', '괴산', '증평', '영동', '옥천',
    
    // 전라도
    '전주', '군산', '익산', '정읍', '남원', '김제', '완주', '진안', '무주', '장수', '임실', '순창', '고창', '부안', '목포', '여수', '순천', '나주', '광양', '담양', '곡성', '구례', '고흥', '보성', '화순', '장흥', '강진', '해남', '영암', '무안', '함평', '영광', '장성', '완도', '진도', '신안',
    
    // 경상도
    '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산', '의성', '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화', '울진', '울릉', '창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산', '의령', '함안', '창녕', '고성', '남해', '하동', '산청', '함양', '거창', '합천',
    
    // 제주
    '제주', '서귀포', '애월', '한림', '우도', '성산'
  ];

  for (const location of locationKeywords) {
    if (scheduleText.includes(location)) {
      return location;
    }
  }
  
  return null;
}

/**
 * 사용자 프로필의 일정에서 날짜와 매칭되는 지역을 찾는 함수
 * 🔥 수정사항: 연도(Year)가 달라도 월/일(MM-DD)이 일치하면 매칭되도록 유연성 추가
 * @param {Object} userProfile - 사용자 프로필 (schedule 포함)
 * @param {Date} targetDate - 대상 날짜 객체
 * @returns {string|null} - 추출된 지역명 또는 null
 */
function getLocationFromSchedule(userProfile, targetDate) {
  if (!userProfile || !userProfile.schedule) {
    return null;
  }

  const scheduleText = userProfile.schedule;
  
  // 1. 정확한 날짜 포맷 (YYYY-MM-DD) - 로컬 시간 기준 생성
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const fullDateStr = `${year}-${month}-${day}`;
  
  // 2. 월-일 포맷 (MM-DD) - 연도가 달라도 매칭하기 위함 (예: 2024-12-16 요청 -> 2025-12-16 일정 매칭)
  const monthDayStr = `${month}-${day}`;
  
  // 3. 다른 포맷 (M/D)
  const shortDateStr = `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;

  console.log(`🔍 일정 검색 키워드: [${fullDateStr}], [-${monthDayStr}], [${shortDateStr}]`);
  
  // 일정을 쉼표로 분리하여 배열로 만듦
  const scheduleItems = scheduleText.split(',').map(item => item.trim());
  
  for (const item of scheduleItems) {
    // 날짜 매칭 확인 로직 강화:
    // 1) YYYY-MM-DD가 완전히 일치하거나
    // 2) YYYY-MM-DD 포맷의 날짜 중 MM-DD 부분만 일치하는 경우 (다른 연도 허용)
    // 3) M/D 포맷이 일치하는 경우
    const isDateMatched = 
      item.includes(fullDateStr) || 
      (item.match(/\d{4}-(\d{2}-\d{2})/) && item.includes(`-${monthDayStr}`)) ||
      item.includes(shortDateStr);

    if (isDateMatched) {
      console.log('✅ 일정 날짜 매칭 성공:', item);
      
      // 해당 일정 텍스트에서 지역명 추출
      const location = extractLocationFromSchedule(item);
      if (location) {
        console.log('📍 일정에서 지역 추출 성공:', location);
        return location;
      }
    }
  }
  
  console.log('❌ 해당 날짜의 일정에서 지역 정보를 찾지 못했습니다.');
  return null;
}

/**
 * (구버전 호환용) 사용자 질문에서 날짜를 추출하고, 해당 날짜의 일정에서 지역을 가져오는 함수
 */
function extractScheduleContext(userInput, userProfile) {
  const targetDate = extractDateFromText(userInput);
  const location = getLocationFromSchedule(userProfile, targetDate);
  
  return {
    date: targetDate,
    location: location
  };
}

module.exports = {
  extractLocationFromSchedule,
  getLocationFromSchedule,
  extractScheduleContext
};