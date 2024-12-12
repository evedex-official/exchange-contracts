import React from "react";
import { useField } from "formik";

type FieldProps = {
  label?: string;
  name: string;
  placeholder?: string;
  fieldType?: "input" | "select";
  children?: any;
  defaultValue?: any;
};

const Field: React.FC<FieldProps> = ({
  label,
  name,
  fieldType = "input",
  ...props
}) => {
  const [field, meta] = useField(name);
  return (
    <div>
      {label && <label htmlFor={name}>{label}</label>}
      <div>
        {fieldType === "select" ? (
          <select id={name} {...field} {...props} />
        ) : (
          <input id={name} {...field} {...props} />
        )}
      </div>
      {meta.error && meta.touched && <div>Error: {meta.error}</div>}
    </div>
  );
};

export default Field;
