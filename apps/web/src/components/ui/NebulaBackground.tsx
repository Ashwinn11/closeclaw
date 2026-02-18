import React, { useEffect, useRef } from 'react';
import './NebulaBackground.css';

export const NebulaBackground: React.FC = () => {
  const starsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (starsRef.current) {
      const container = starsRef.current;
      // Clear existing stars to prevent duplication on re-renders
      container.innerHTML = '';
      
      const starCount = 100;
      for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        star.classList.add(i % 3 === 0 ? 'star-twinkle' : 'star-static');
        
        // Random position
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        
        // Random size (mostly small)
        const size = Math.random() < 0.9 ? Math.random() * 2 + 1 : Math.random() * 3 + 2;
        
        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.animationDelay = `${Math.random() * 5}s`;
        
        container.appendChild(star);
      }
    }
  }, []);

  return (
    <div className="nebula-container">
      <div className="nebula-layer gradient-1"></div>
      <div className="nebula-layer gradient-2"></div>
      <div className="nebula-layer gradient-3"></div>
      <div className="stars-layer" ref={starsRef}></div>
      <div className="nebula-noise"></div>
    </div>
  );
};
