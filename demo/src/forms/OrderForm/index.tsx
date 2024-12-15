import React, { useState } from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { Address, parseUnits, zeroAddress } from "viem";

import Form, { Field, FieldProps } from "../../components/Form";
import { Btc, Usdt } from "../../contracts";
import useSignOrder from "../../hooks/useSignOrder";
import {
  BTC_USD_INDEX,
  BUY_SIDE,
  SELL_SIDE,
  USDT_COLLATERAL_INDEX,
} from "../../constants";
import Collapse from "../../components/Collapse";
import useAccounts from "../../hooks/useAccounts";
import { useField } from "formik";
import useSession from "../../hooks/useSessions";

type SessionFieldProps = FieldProps & {
  dependsField: string;
};

const SessionField: React.FC<SessionFieldProps> = ({
  dependsField,
  ...props
}) => {
  const { alice, bob } = useAccounts();
  const [field] = useField(dependsField);
  const activeWallet = [alice, bob].find((w) => w.key === field.value);
  const { data } = useSession(activeWallet?.account);

  return (
    <Field fieldType="select" {...props}>
      {Object.keys(data || {}).map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </Field>
  );
};

const validationSchema = yup.object({
  address: yup.string().required(),
  session: yup.string(),
  account: yup.string().required(),
  orderType: yup.string().required(),
  amount: yup.number().required(),
  leverage: yup.number().required(),
});

const initialValues = {
  account: "",
  session: "",
  address: Btc.address,
  orderType: BUY_SIDE,
  leverage: 10,
  amount: 10,
};

const tokens = {
  [Usdt.address]: {
    decimals: 6,
  },
  [Btc.address]: {
    decimals: 18,
  },
};

const OrderForm: React.FC = () => {
  const { alice, bob, aliceSession, bobSession, matcher } = useAccounts();
  const [signedOrder, setSignedOrder] = useState<string | null>(null);
  const { signOrder } = useSignOrder();
  const onSubmit = async (values: any) => {
    const token = tokens[values.address];

    const activeWallet = [alice, bob].find((w) => w.key === values.account);
    if (!activeWallet) return;

    const sessionWallet = [aliceSession, bobSession].find(
      (w) => w.account.address.toLowerCase() === values.session.toLowerCase()
    );

    const account = !!sessionWallet
      ? sessionWallet.account
      : activeWallet.account;

    try {
      const dataToSign = {
        account,
        senderWallet: activeWallet.account.address,
        userSessionWallet: sessionWallet
          ? sessionWallet.account.address
          : zeroAddress,
        amount: parseUnits(values.amount.toString(), token.decimals),
        leverage: BigInt(values.leverage),
        collateral: values.address,
        collateralIndex: USDT_COLLATERAL_INDEX,
        side: values.orderType,
        instrumentIndex: BTC_USD_INDEX,
        matcherAddress: matcher.account.address,
      };

      const signedData = await signOrder(dataToSign);

      setSignedOrder(signedData);

      toast.success(`Order placed.`);
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <Collapse title="Place order">
      <Form
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
      >
        <Field
          label="Account"
          name="account"
          fieldType="select"
          placeholder="Select"
        >
          {[alice, bob].map((wallet) => (
            <option key={wallet.key} value={wallet.key}>
              {wallet.key} ({wallet.account.address})
            </option>
          ))}
        </Field>
        <SessionField
          label="Account session"
          name="session"
          dependsField="account"
        />
        <Field
          label="Token"
          name="address"
          fieldType="select"
          placeholder="Select"
        >
          <option value={Usdt.address}>USDT</option>
          <option value={Btc.address}>BTC</option>
        </Field>
        <Field
          label="Side"
          name="orderType"
          fieldType="select"
          placeholder="Select"
        >
          <option value={SELL_SIDE}>SELL</option>
          <option value={BUY_SIDE}>BUY</option>
        </Field>
        <Field label="Amount" name="amount" />
        <Field
          label="Leverage"
          name="leverage"
          type="number"
          min={1}
          max={100}
        />
      </Form>
      <div>Signed order data: {signedOrder}</div>
    </Collapse>
  );
};

export default OrderForm;
