'use client';

import { useState } from 'react';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-[360px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[600px]">
          {/* Header */}
          <div className="bg-[#0055A4] text-white px-4 py-3">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2 font-bold">
                <span className="italic text-lg">DECATHLON</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-xl leading-none">
                ✕
              </button>
            </div>
            <div className="flex justify-between text-xs text-blue-100">
              <span className="flex items-center gap-1">👤 상담사 연결 원활</span>
              <span className="flex items-center gap-1">🕒 운영시간 보기</span>
            </div>
          </div>

          {/* Chat Body */}
          <div className="flex-grow bg-[#F8F9FA] p-4 overflow-y-auto">
            <div className="text-center text-xs text-gray-400 mb-4">2026년 05월 09일</div>
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0055A4] flex items-center justify-center text-white italic font-bold text-xs flex-shrink-0">
                D
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">DECATHLON</div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-3 text-sm text-gray-700 shadow-sm">
                  안녕하세요, 세상의 모든 스포츠 데카트론 코리아입니다⚽
                  <br />
                  <br />
                  고객센터 운영 시간은 평일 오전 09시~ 6시(점심시간 12시~1시, 공휴일 휴무)입니다.
                  <button className="mt-3 block px-4 py-1.5 border border-gray-300 rounded-full text-sm font-bold text-gray-700 hover:bg-gray-50">
                    상담 시작 하기
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="bg-[#0055A4] grid grid-cols-3 text-center text-white text-xs py-2">
            <button className="border-r border-blue-400 hover:bg-blue-700">채팅 상담 시작</button>
            <button className="border-r border-blue-400 hover:bg-blue-700">이전으로</button>
            <button className="hover:bg-blue-700">상담종료</button>
          </div>
          <div className="p-3 bg-white flex items-center gap-2">
            <span className="text-gray-400 text-xl transform rotate-45">📎</span>
            <input
              type="text"
              placeholder="메시지를 입력해 주세요."
              className="flex-grow text-sm outline-none"
              disabled
            />
            <span className="text-black text-xl">➤</span>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-[#0055A4] text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        <span className="font-black italic text-xl">D</span>
      </button>
    </div>
  );
}
