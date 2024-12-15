import React from "react";
import { maxUint128, maxUint32, maxUint64 } from "viem";
import * as yup from "yup";

import Form, { Field } from "../../components/Form";
import useCreateSession from "../../hooks/useCreateSession";
import { toast } from "react-toastify";
import Collapse from "../../components/Collapse";
import useAccounts from "../../hooks/useAccounts";
import { useField } from "formik";
import useSession from "../../hooks/useSessions";
import BooleanSelectField from "../../components/BooleanSelect";
import { useConfig } from "../../providers/ConfigProvider";

const SessionsInfo = () => {
  const { alice, bob } = useAccounts();
  const [field] = useField("account");
  const activeAccount = [alice, bob].find((w) => w.key === field.value);
  const { data, isLoading } = useSession(activeAccount?.wallet);
  const parsedData = React.useMemo(() => {
    return Object.keys(data || {}).reduce((acc, key) => {
      const localItem = data[key];

      if (localItem) {
        acc[key] = {
          ...localItem,
          expiration: localItem.expiration.toString(),
          allowanceAllowed: localItem.allowanceAllowed.toString(),
        };
      }

      return acc;
    }, {} as any);
  }, [data]);

  if (!activeAccount) return null;
  return (
    <div>
      <div>Sessions</div>
      <pre>
        {isLoading ? "Loading..." : JSON.stringify(parsedData, null, 2)}
      </pre>
      <hr />
    </div>
  );
};

const validationSchema = yup.object({
  sessionWallet: yup.string().required(),
  account: yup.string().required(),
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
  account: "",
  expirationTs: maxUint64.toString(),
  limitMaxOrders: false,
  ordersAllowed: maxUint32.toString(),
  limitAllowance: false,
  allowanceAllowed: maxUint128.toString(),
  limitWithdrawals: false,
  withdrawConfig: [],
};

const SessionForm: React.FC = () => {
  const { sessionWallets } = useConfig();
  const { alice, bob } = useAccounts();
  const { createSession } = useCreateSession();
  const onSubmit = async (values: any) => {
    try {
      const activeWallet = [alice, bob].find((w) => w.key === values.account);
      if (!activeWallet) return;

      await createSession({
        account: activeWallet?.wallet,
        sessionWallet: values.sessionWallet,
        expirationTs: BigInt(values.expirationTs),
        limitMaxOrders: Boolean(values.limitMaxOrders),
        ordersAllowed: BigInt(values.ordersAllowed),
        limitAllowance: Boolean(values.limitAllowance),
        allowanceAllowed: BigInt(values.allowanceAllowed),
        limitWithdrawals: Boolean(values.limitWithdrawals),
        withdrawConfig: [],
      });
      toast.success("Session created.");
    } catch (e) {
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <Collapse title="Create session">
      <Form
        onSubmit={onSubmit}
        initialValues={initialValues}
        validationSchema={validationSchema}
      >
        <Field
          label="Account"
          name="account"
          fieldType="select"
          placeholder="Select"
        >
          {[alice, bob].map((account) => (
            <option key={account.key} value={account.key}>
              {account.key} ({account.wallet.address})
            </option>
          ))}
        </Field>
        <SessionsInfo />
        <Field label="Session wallet" name="sessionWallet" fieldType="select">
          {sessionWallets.map((w) => (
            <option key={w.address} value={w.address}>
              {w.address}
            </option>
          ))}
        </Field>
        <Field label="Expiration" name="expirationTs" />
        <BooleanSelectField label="Limit max orders" name="limitMaxOrders" />
        <Field label="Orders allowed" name="ordersAllowed" />
        <BooleanSelectField label="Limit allowance" name="limitAllowance" />
        <Field label="Allowance allowed" name="allowanceAllowed" />
        <BooleanSelectField label="Limit withdrawals" name="limitWithdrawals" />
      </Form>
    </Collapse>
  );
};

export default SessionForm;
