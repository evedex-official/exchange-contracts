import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { parseUnits, zeroAddress } from "viem";

import Form, { Field } from "../../components/Form";
import { Btc, Usdt } from "../../contracts";
import useSignOrder from "../../hooks/useSignOrder";
import { BUY_SIDE, SELL_SIDE } from "../../constants";
import Collapse from "../../components/Collapse";
import { useConfig } from "../../providers/ConfigProvider";
import SessionField from "../../components/SessionFIeld/SessionField";
import { useMatcherState } from "../../providers/MatcherProvider";
import useInstruments, {
  useInstrumentsPrices,
} from "../../hooks/useInstruments";
import useCollaterals from "../../hooks/useCollaterals";
import usePrices from "../../hooks/usePrices";
import { Collateral } from "../../helpers/event-horizon-types";
import { useField } from "formik";

const PriceField: React.FC<{
  name: string;
  label: string;
  instrumentFieldName: string;
}> = ({ name, label, instrumentFieldName }) => {
  const instrumentsPrices = useInstrumentsPrices();
  const [instrumentField] = useField(instrumentFieldName);
  const [_, meta, helpers] = useField(name);
  const instrumentPrice = (
    instrumentsPrices[instrumentField.value] || { price: 0n }
  ).price.toString();

  useEffect(() => {
    if (!meta.touched) {
      console.log("setValue", instrumentPrice);
      helpers.setValue(instrumentPrice);
    }
  }, [meta.touched, instrumentPrice]);
  return <Field name={name} label={label} />;
};

const validationSchema = yup.object({
  collateral: yup.string().required(),
  session: yup.string(),
  account: yup.string().required(),
  instrument: yup.number().required(),
  orderType: yup.string().required(),
  amount: yup.number().required(),
  leverage: yup.number().required(),
  price: yup.number().required(),
  takeProfit: yup.number(),
  stopLoss: yup.number(),
});

const initialValues = {
  account: "",
  session: "",
  instrument: "",
  takeProfit: "",
  stopLoss: "",
  collateral: Usdt.address,
  orderType: BUY_SIDE,
  leverage: 10,
  amount: 0.01,
  price: 0,
};

const OrderForm: React.FC = () => {
  const { addOrder } = useMatcherState();
  const { instruments } = useInstruments();
  const { collaterals } = useCollaterals();
  const { accounts, sessionWallets } = useConfig();
  const { alice, bob, matcher } = accounts;
  const { signOrder, signMultiOrder } = useSignOrder();
  const prices = usePrices();
  const onSubmit = async (values: any) => {
    const activeAccount = [alice, bob].find((w) => w.key === values.account);
    const collateral = collaterals.find(
      (c: Collateral) => (c.address = values.collateral)
    );
    const instrument = instruments.find((i) => i.index == values.instrument);

    try {
      if (!instrument)
        throw new Error(`Instrument not found: ${values.instrument}`);
      if (!collateral)
        throw new Error(`Collateral not found: ${values.collateral}`);
      if (!activeAccount) return;

      const instrumentPrice: bigint =
        BigInt(values.price) || prices[instrument.token.address];

      if (!instrumentPrice) throw new Error("No instrument price");

      const sessionAccount = sessionWallets.find(
        (a) => a.address.toLowerCase() === values.session.toLowerCase()
      );

      const account = !!sessionAccount ? sessionAccount : activeAccount.wallet;
      const userSessionWallet = sessionAccount
        ? sessionAccount.address
        : zeroAddress;

      const amount = parseUnits(
        values.amount.toString(),
        instrument.token.decimals
      );
      const senderWallet = activeAccount.wallet.address;
      const leverage = BigInt(values.leverage);
      const instrumentIndex = values.instrument;
      const matcherAddress = matcher.wallet.address;
      const collateralIndex = collateral.index;

      const dataToSign = {
        senderWallet,
        userSessionWallet,
        amount,
        leverage,
        collateral: collateral.address,
        collateralIndex,
        side: values.orderType,
        instrumentIndex,
        matcherAddress,
        instrumentPrice,
      };

      if (values.stopLoss || values.takeProfit) {
        const arrayOfDataToSign = [dataToSign];

        const isLong = values.orderType === BUY_SIDE;

        if (values.stopLoss) {
          const stopDiffPrice =
            (dataToSign.instrumentPrice * BigInt(values.stopLoss)) / 100n;

          const stopLossOrder = {
            ...dataToSign,
            side: isLong ? SELL_SIDE : BUY_SIDE,
            instrumentPrice: isLong
              ? dataToSign.instrumentPrice - stopDiffPrice
              : dataToSign.instrumentPrice + stopDiffPrice,
          };

          arrayOfDataToSign.push(stopLossOrder);
        }

        if (values.takeProfit) {
          const takeDiffPrice =
            (dataToSign.instrumentPrice * BigInt(values.takeProfit)) / 100n;

          const takeProfitOrder = {
            ...dataToSign,
            side: isLong ? SELL_SIDE : BUY_SIDE,
            instrumentPrice: isLong
              ? dataToSign.instrumentPrice + takeDiffPrice
              : dataToSign.instrumentPrice - takeDiffPrice,
          };
          arrayOfDataToSign.push(takeProfitOrder);
        }

        const signedOrders = await signMultiOrder(arrayOfDataToSign, account);
        signedOrders.forEach((signedOrder) => addOrder(signedOrder));
      } else {
        const signedOrder = await signOrder(dataToSign, account);
        addOrder(signedOrder);
      }

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
          label="Instrument"
          name="instrument"
          fieldType="select"
          placeholder="Select"
        >
          {Object.keys(instruments).map((key) => (
            <option key={key} value={key}>
              {instruments[parseInt(key)].ticker}
            </option>
          ))}
        </Field>
        <Field
          label="Collateral"
          name="collateral"
          fieldType="select"
          placeholder="Select"
        >
          {collaterals.map((c: Collateral) => (
            <option key={c.address} value={c.address}>
              {c.symbol}
            </option>
          ))}
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
        <PriceField
          label="Price"
          name="price"
          instrumentFieldName="instrument"
        />
        <Field label="Take profit, %" name="takeProfit" min={1} max={300} />
        <Field label="Stop loss, %" name="stopLoss" min={1} max={99} />
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
