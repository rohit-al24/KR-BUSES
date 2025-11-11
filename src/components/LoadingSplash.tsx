import React from 'react';

const LoadingSplash: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Blurred banner background */}
  <div className="absolute inset-0 bg-center bg-cover filter blur-sm" style={{ backgroundImage: `url('/Airbrush-Image-Enhancer-1760071093259.jpg')`, opacity: 0.7 }} />

      <div className="relative flex flex-col items-center gap-6 p-8">
        {/* College logo placeholder (replace with real logo at /public/college-logo.png) */}
        <div className="flex items-center justify-center w-28 h-28 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
          <img
            src="/K R LOGO 4.jpeg.jpg"
            alt="BusMate Logo"
            className="w-20 h-20 object-contain"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement;
              el.style.display = 'none';
            }}
          />
        </div>

        {/* College name with soft glow */}
        <h1 className="text-2xl md:text-4xl text-white font-extrabold text-center leading-tight drop-shadow-[0_2px_20px_rgba(255,255,255,0.22)]" style={{ textShadow: '0 2px 18px rgba(255,255,255,0.22)' }}>
          BusMate
        </h1>

        {/* optional small message and spinner */}
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-white/90">{message || 'Loading...'}</span>
        </div>
      </div>
    </div>
  );
};

export default LoadingSplash;
