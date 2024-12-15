import React, { useEffect } from "react";
import { useField } from "formik";

import useAccounts from "../../hooks/useAccounts";
import useSession from "../../hooks/useSessions";

import { Field, FieldProps } from "../Form";

type SessionFieldProps = FieldProps & {
  dependsField: string;
};

const SessionField: React.FC<SessionFieldProps> = ({
  dependsField,
  name,
  ...props
}) => {
  const { alice, bob } = useAccounts();
  const [field] = useField(dependsField);
  const activeAccount = [alice, bob].find((w) => w.key === field.value);
  const { data } = useSession(activeAccount?.wallet);
  const [_, __, helpers] = useField(name);

  useEffect(() => {
    helpers.setValue("");
  }, [field.value]);

  return (
    <Field fieldType="select" name={name} {...props}>
      {Object.keys(data || {}).map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </Field>
  );
};

export default SessionField;
