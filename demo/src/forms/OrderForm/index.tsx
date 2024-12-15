import React, { useState } from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { parseUnits, zeroAddress } from "viem";

import Form, { Field } from "../../components/Form";
import { Btc, Usdt } from "../../contracts";
import useSignOrder from "../../hooks/useSignOrder";
import {
  BTC_USD_INDEX,
  BUY_SIDE,
  SELL_SIDE,
  USDT_COLLATERAL_INDEX,
} from "../../constants";
import Collapse from "../../components/Collapse";
import { useConfig } from "../../providers/ConfigProvider";
import SessionField from "../../components/SessionFIeld/SessionField";
import { useMatcherState } from "../../providers/MatcherProvider";

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
  const { addOrder } = useMatcherState();
  const { accounts, sessionWallets } = useConfig();
  const { alice, bob, matcher } = accounts;
  const { signOrder } = useSignOrder();
  const onSubmit = async (values: any) => {
    const token = tokens[values.address];

    const activeAccount = [alice, bob].find((w) => w.key === values.account);
    if (!activeAccount) return;

    const sessionAccount = sessionWallets.find(
      (a) => a.address.toLowerCase() === values.session.toLowerCase()
    );

    const account = !!sessionAccount ? sessionAccount : activeAccount.wallet;

    try {
      const dataToSign = {
        account,
        senderWallet: activeAccount.wallet.address,
        userSessionWallet: sessionAccount
          ? sessionAccount.address
          : zeroAddress,
        amount: parseUnits(values.amount.toString(), token.decimals),
        leverage: BigInt(values.leverage),
        collateral: values.address,
        collateralIndex: USDT_COLLATERAL_INDEX,
        side: values.orderType,
        instrumentIndex: BTC_USD_INDEX,
        matcherAddress: matcher.wallet.address,
      };

      const signedOrder = await signOrder(dataToSign);

      addOrder(signedOrder);

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
          {[alice, bob].map((account) => (
            <option key={account.key} value={account.key}>
              {account.key} ({account.wallet.address})
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
    </Collapse>
  );
};

export default OrderForm;
