import React from "react";
import { useField } from "formik";

type FieldProps = {
  label?: string;
  name: string;
  placeholder?: string;
  fieldType?: "input" | "select";
  children?: any;
  defaultValue?: any;
  type?: string;
  min?: number;
  max?: number;
};

const Field: React.FC<FieldProps> = ({
  label,
  name,
  fieldType = "input",
  children,
  placeholder,
  ...props
}) => {
  const [field, meta] = useField(name);
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={name}>
          {label}
        </label>
      )}
      <div className="field-input">
        {fieldType === "select" ? (
          <select id={name} {...field} {...props}>
            <option value="" disabled>
              {placeholder}
            </option>
            {children}
          </select>
        ) : (
          <input id={name} {...field} {...props} placeholder={placeholder} />
        )}
      </div>
      {meta.error && meta.touched && (
        <div className="field-error">Error: {meta.error}</div>
      )}
    </div>
  );
};

export default Field;
