import React, { useState } from "react";
import { toast } from "react-toastify";
import * as yup from "yup";

import Form, { Field } from "../../components/Form";
import { Btc, Usdt } from "../../contracts";
import { Address, parseUnits } from "viem";
import useSignOrder from "../../hooks/useSignOrder";
import {
  BTC_USD_INDEX,
  BUY_SIDE,
  SELL_SIDE,
  USDT_COLLATERAL_INDEX,
} from "../../constants";
// import useSession from "../../hooks/useSessions";

const validationSchema = yup.object({
  address: yup.string().required(),
  orderType: yup.string().required(),
  amount: yup.number().required(),
  leverage: yup.number().required(),
  sender: yup.string().required(),
});

const initialValues = {
  sender: "",
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
  const [signedOrder, setSignedOrder] = useState<string | null>(null);
  const { signOrder } = useSignOrder();
  // const { data } = useSession();
  // const sessions: Address[] = data as Address[];
  const onSubmit = async (values: any) => {
    const token = tokens[values.address];

    try {
      const dataToSign = {
        senderWallet: values.sender,
        amount: parseUnits(values.amount.toString(), token.decimals),
        leverage: BigInt(values.leverage),
        collateral: values.address,
        collateralIndex: USDT_COLLATERAL_INDEX,
        side: values.orderType,
        instrumentIndex: BTC_USD_INDEX,
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
    <div>
      <Form
        title="Place order"
        initialValues={initialValues}
        onSubmit={onSubmit}
        validationSchema={validationSchema}
      >
        {/* <Field
          label="Session Wallet"
          name="session"
          fieldType="select"
          placeholder="Select"
        >
          {(sessions || []).map((session) => (
            <option key={session} value={session}>
              {session}
            </option>
          ))}
        </Field> */}
        <Field label="Sender" name="sender" />
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
    </div>
  );
};

export default OrderForm;
