import React from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { useField } from "formik";
import { parseUnits, zeroAddress } from "viem";

import { Btc, Usdt } from "../../contracts";

import useAccounts from "../../hooks/useAccounts";
import useWithdraw from "../../hooks/useWithdraw";

import Form, { Field } from "../../components/Form";
import WalletBalances from "../../components/WalletBalances";
import DexBalances from "../../components/DexBalances";
import Collapse from "../../components/Collapse";
import SessionField from "../../components/SessionFIeld/SessionField";
import { useMatcherState } from "../../providers/MatcherProvider";

const AccountBalances = () => {
  const { alice, bob } = useAccounts();
  const [accountField] = useField("account");
  const activeAccount = [alice, bob].find(
    (w) => w.key === (accountField as any)?.value
  );
  if (!activeAccount) return null;

  return (
    <>
      <WalletBalances account={activeAccount.wallet} />
      <DexBalances account={activeAccount.wallet} />
      <hr />
    </>
  );
};

const validationSchema = yup.object({
  account: yup.string().required(),
  session: yup.string(),
  token: yup.string().required(),
  amount: yup.number().required(),
});

const initialValues = {
  account: "",
  session: "",
  token: "",
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

const WithdrawForm: React.FC = () => {
  const { addWithdrawRequest } = useMatcherState();
  const { withdrawRequest } = useWithdraw();
  const { alice, bob } = useAccounts();
  const onSubmit = async (values: any) => {
    const token = tokens[values.token];
    const activeAccount = [alice, bob].find((w) => w.key === values.account);

    try {
      if (!activeAccount) return;

      const { request, tx } = await withdrawRequest({
        collateralAddress: values.token,
        amount: parseUnits(values.amount.toString(), token.decimals),
        withdrawerWallet: activeAccount.wallet.address,
        userSessionWallet: values.session || zeroAddress,
        account: activeAccount.wallet,
      });

      addWithdrawRequest(request, activeAccount.wallet.address);

      toast.success(`Withdraw requested. ${tx}`);
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <Collapse title="Withdraw">
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
        <AccountBalances />
        <SessionField
          label="Account session"
          name="session"
          dependsField="account"
        />
        <Field
          label="Token"
          name="token"
          fieldType="select"
          placeholder="Select"
        >
          <option value={Usdt.address}>USDT</option>
          <option value={Btc.address}>BTC</option>
        </Field>
        <Field label="Amount" name="amount" />
      </Form>
    </Collapse>
  );
};

export default WithdrawForm;
