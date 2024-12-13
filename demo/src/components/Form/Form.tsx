import React from "react";
import { Formik, Form as FormikForm, useFormikContext } from "formik";

import Button from "../Button";

type SubmitButtonProps = {
  children: any;
};

const SubmitButton: React.FC<SubmitButtonProps> = ({ children }) => {
  const { isSubmitting, isValid } = useFormikContext();
  return (
    <Button type="submit" isLoading={isSubmitting} disabled={!isValid}>
      {children}
    </Button>
  );
};

const Errors = () => {
  const { errors } = useFormikContext();
  const errorsKeys = Object.keys(errors);
  if (!errorsKeys.length) return null;

  return <pre>{JSON.stringify(errors, null, 2)}</pre>;
};

type FormProps = {
  title?: any;
  initialValues: any;
  children: any;
  onSubmit: (values: any) => Promise<void>;
  validationSchema?: any;
};

const Form: React.FC<FormProps> = ({
  title,
  initialValues,
  children,
  onSubmit,
  validationSchema,
}) => {
  return (
    <Formik
      onSubmit={onSubmit}
      initialValues={initialValues}
      validationSchema={validationSchema}
    >
      <FormikForm className="form">
        {title && <h2>{title}</h2>}
        <div>{children}</div>
        <SubmitButton>Submit</SubmitButton>
        <Errors />
      </FormikForm>
    </Formik>
  );
};

export default Form;
