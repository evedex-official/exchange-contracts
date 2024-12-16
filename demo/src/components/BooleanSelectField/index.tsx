import React from "react";

import { Field, FieldProps } from "../Form";

type BooleanSelectFieldProps = FieldProps & {
  yesLabel?: string;
  noLabel?: string;
};

const BooleanSelectField: React.FC<BooleanSelectFieldProps> = ({
  yesLabel = "true",
  noLabel = "false",
  ...props
}) => {
  return (
    <Field fieldType="select" placeholder="Select" {...props}>
      <option value={1}>{yesLabel}</option>
      <option value={0}>{noLabel}</option>
    </Field>
  );
};

export default BooleanSelectField;
