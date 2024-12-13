import React from "react";
import { maxUint128, maxUint32, maxUint64 } from "viem";
import * as yup from "yup";

import Form, { Field } from "../../components/Form";
import useCreateSession from "../../hooks/useCreateSession";
import { toast } from "react-toastify";

const validationSchema = yup.object({
  sessionWallet: yup.string().required(),
  expirationTs: yup.string().required(),
  limitMaxOrders: yup.boolean().required(),
  ordersAllowed: yup.string().required(),
  limitAllowance: yup.boolean().required(),
  allowanceAllowed: yup.string().required(),
  limitWithdrawals: yup.boolean().required(),
  withdrawConfig: yup.array(yup.object()),
});

const initialValues = {
  sessionWallet: "",
  expirationTs: maxUint64.toString(),
  limitMaxOrders: false,
  ordersAllowed: maxUint32.toString(),
  limitAllowance: false,
  allowanceAllowed: maxUint128.toString(),
  limitWithdrawals: false,
  withdrawConfig: [],
};

const SessionForm: React.FC = () => {
  const { createSession } = useCreateSession();
  const onSubmit = async (values: any) => {
    try {
      await createSession({
        sessionWallet: values.sessionWallet,
        expirationTs: BigInt(values.expirationTs),
        limitMaxOrders: values.limitMaxOrders,
        ordersAllowed: BigInt(values.ordersAllowed),
        limitAllowance: values.limitAllowance,
        allowanceAllowed: BigInt(values.allowanceAllowed),
        limitWithdrawals: values.limitWithdrawals,
        withdrawConfig: [],
      });
      toast.success("Session created.");
    } catch (e) {
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <div>
      <Form
        title="Create session"
        onSubmit={onSubmit}
        initialValues={initialValues}
        validationSchema={validationSchema}
      >
        <Field label="Session wallet" name="sessionWallet" />
        <Field label="Expiration" name="expirationTs" />
        <Field label="Limit max orders" name="limitMaxOrders" />
        <Field label="Orders allowed" name="ordersAllowed" />
        <Field label="Limit allowance" name="limitAllowance" />
        <Field label="Allowance allowed" name="allowanceAllowed" />
        <Field label="Limit withdrawals" name="limitWithdrawals" />
      </Form>
    </div>
  );
};

export default SessionForm;
