import React from "react";
import { useField } from "formik";

export type FieldProps = React.HTMLAttributes<
  HTMLInputElement | HTMLSelectElement
> & {
  label?: string;
  name: string;
  placeholder?: string;
  fieldType?: "input" | "select";
  children?: any;
  defaultValue?: any;
  type?: string;
  min?: number;
  max?: number;
  error?: string;
};

export type BaseFieldProps = {
  value: any;
};

export const BaseField: React.FC<FieldProps> = ({
  label,
  name,
  fieldType = "input",
  children,
  placeholder,
  error,
  ...props
}) => {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={name}>
          {label}
        </label>
      )}
      <div className="field-input">
        {fieldType === "select" ? (
          <select id={name} name={name} {...props}>
            <option value="" disabled>
              {placeholder}
            </option>
            {children}
          </select>
        ) : (
          <input id={name} name={name} {...props} placeholder={placeholder} />
        )}
      </div>
      {error && <div className="field-error">Error: {error}</div>}
    </div>
  );
};

const Field: React.FC<FieldProps> = ({ name, ...props }) => {
  const [field, meta] = useField(name);
  const error = meta.touched ? meta.error : undefined;
  return <BaseField {...props} {...field} error={error} />;
};

export default Field;
