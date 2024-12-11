import React from "react";

import Form, { Field } from "../../components/Form";

const initialValues = {
  address: "",
  amount: 10,
};

const DepositForm: React.FC = () => {
  const onSubmit = async () => {};
  return (
    <Form title="Deposit" initialValues={initialValues} onSubmit={onSubmit}>
      <Field label="Token" name="address" />
      <Field label="Amount" name="amount" />
    </Form>
  );
};

export default DepositForm;
