import React from 'react';
import './Button.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const classes = `
    btn 
    btn-${variant} 
    btn-${size} 
    ${fullWidth ? 'btn-full' : ''} 
    ${className}
  `.trim().replace(/\s+/g, ' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};
