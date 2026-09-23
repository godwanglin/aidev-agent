import React from 'react';

interface AidevLogoProps {
  className?: string;
  showText?: boolean;
}

export const AidevLogo: React.FC<AidevLogoProps> = ({ className = 'w-4 h-4', showText = false }) => {
  return (
    <div className="inline-flex items-center gap-1.5 select-none shrink-0">
      <img
        src="/logo.png"
        alt="Aidev"
        className={`${className} object-contain`}
      />
      {showText && (
        <span className="font-semibold text-xs tracking-tight text-white">Aidev</span>
      )}
    </div>
  );
};

// Backwards compatibility alias so existing imports work seamlessly
export const AntigravityLogo = AidevLogo;
