'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NotFound() {
    const [showContact, setShowContact] = useState(false);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
            {/* 404 Text */}
            <h1 className="text-8xl md:text-9xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent mb-4">
                404
            </h1>

            {/* Robot Illustration */}
            <div className="relative mb-6">
                <svg
                    className="w-40 h-40 md:w-48 md:h-48"
                    viewBox="0 0 200 200"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Robot Body */}
                    <ellipse cx="100" cy="130" rx="50" ry="45" fill="#E8F4FC" stroke="#3B82F6" strokeWidth="2" />

                    {/* Robot Head */}
                    <ellipse cx="100" cy="75" rx="40" ry="35" fill="#E8F4FC" stroke="#3B82F6" strokeWidth="2" />

                    {/* Antenna */}
                    <circle cx="100" cy="35" r="6" fill="#3B82F6" />
                    <line x1="100" y1="40" x2="100" y2="42" stroke="#3B82F6" strokeWidth="2" />

                    {/* Eyes */}
                    <ellipse cx="85" cy="70" rx="8" ry="10" fill="white" stroke="#3B82F6" strokeWidth="1.5" />
                    <ellipse cx="115" cy="70" rx="8" ry="10" fill="white" stroke="#3B82F6" strokeWidth="1.5" />
                    <circle cx="85" cy="72" r="4" fill="#3B82F6" />
                    <circle cx="115" cy="72" r="4" fill="#3B82F6" />

                    {/* Sad Mouth */}
                    <path d="M90 95 Q100 88, 110 95" stroke="#3B82F6" strokeWidth="2" fill="none" strokeLinecap="round" />

                    {/* Arms */}
                    <ellipse cx="45" cy="130" rx="12" ry="18" fill="#E8F4FC" stroke="#3B82F6" strokeWidth="2" />
                    <ellipse cx="155" cy="130" rx="12" ry="18" fill="#E8F4FC" stroke="#3B82F6" strokeWidth="2" />

                    {/* Belly Button/Light */}
                    <circle cx="100" cy="130" r="8" fill="#3B82F6" />
                    <circle cx="100" cy="130" r="4" fill="#60A5FA" />
                </svg>

                {/* Question Marks */}
                <span className="absolute -top-2 -right-4 text-3xl text-blue-400 animate-bounce">?</span>
                <span className="absolute top-8 -right-8 text-2xl text-blue-300 animate-bounce" style={{ animationDelay: '0.2s' }}>?</span>
                <span className="absolute -top-4 -left-6 text-2xl text-blue-300 animate-bounce" style={{ animationDelay: '0.4s' }}>?</span>

                {/* Speech Bubble */}
                <div className="absolute -top-2 right-[-70px] bg-white border-2 border-blue-200 rounded-xl px-3 py-1 shadow-sm">
                    <span className="text-blue-500 font-medium text-sm">???</span>
                </div>
            </div>

            {/* Message */}
            <h2 className="text-2xl md:text-3xl font-bold text-blue-600 mb-2 text-center">
                อุ๊ปส์! ไม่พบหน้าที่ต้องการ
            </h2>
            <p className="text-gray-500 mb-8 text-center max-w-md">
                หน้าที่คุณกำลังมองหาอาจถูกย้าย ลบไปแล้ว หรือไม่เคยมีอยู่
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 relative">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    กลับหน้าหลัก
                </Link>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowContact(!showContact)}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-600 font-medium rounded-lg border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        ติดต่อ IT
                    </button>

                    {/* Contact Card */}
                    {showContact && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-10">
                            {/* Arrow */}
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-gray-200 rotate-45"></div>

                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">ฝ่าย IT</h3>
                                    <p className="text-sm text-gray-500">พร้อมช่วยเหลือคุณ</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <a
                                    href="tel:250"
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 transition-colors group"
                                >
                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200">
                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">โทรภายใน</p>
                                        <p className="font-semibold text-gray-900 text-lg">250</p>
                                    </div>
                                </a>

                                <a
                                    href="mailto:Yutthachai@tusm.thaisugarmill.com"
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50 transition-colors group"
                                >
                                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-500">อีเมล</p>
                                        <p className="font-medium text-gray-900 text-sm break-all">Yutthachai@tusm.thaisugarmill.com</p>
                                    </div>
                                </a>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowContact(false)}
                                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
