import React from 'react';
import './Card.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  className = '', 
  hoverable = false,
  ...props 
}) => {
  return (
    <div 
      className={`card-base ${hoverable ? 'card-hoverable' : ''} ${className}`} 
      {...props}
    >
      {children}
    </div>
  );
};
