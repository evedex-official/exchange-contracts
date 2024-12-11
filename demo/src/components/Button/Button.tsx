import React, { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  children: any;
};

const Button: React.FC<ButtonProps> = ({ isLoading, children, ...props }) => {
  return <button {...props}>{isLoading ? "Loading..." : children}</button>;
};

export default Button;
