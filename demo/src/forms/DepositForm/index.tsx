import React from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { useField, useFormikContext } from "formik";
import { useWriteContract } from "wagmi";
import { Address, parseUnits } from "viem";

import { Btc, DepositDEX, Usdt } from "../../contracts";

import useApprove from "../../hooks/useApprove";
import useAccounts from "../../hooks/useAccounts";

import Button from "../../components/Button";
import Form, { Field } from "../../components/Form";
import WalletBalances from "../../components/WalletBalances";
import DexBalances from "../../components/DexBalances";
import Collapse from "../../components/Collapse";

const AccountBalances = () => {
  const { alice, bob } = useAccounts();
  const [accountField] = useField("account");
  const activeWallet = [alice, bob].find(
    (w) => w.key === (accountField as any)?.value
  );
  if (!activeWallet) return null;

  return (
    <>
      <WalletBalances account={activeWallet.account} />
      <DexBalances account={activeWallet.account} />
      <hr />
    </>
  );
};

const AllowanceNote = () => {
  const { values } = useFormikContext<any>();
  const { alice, bob } = useAccounts();
  const activeWallet = [alice, bob].find((w) => w.key === values.account);
  const { allowance, onMaxApprove, isApproving } = useApprove({
    account: activeWallet?.account,
    source: values.token as Address,
    spender: DepositDEX.address as Address,
  });

  if (!values.account || !values.token) return null;

  if (allowance > values.amount) return null;

  return (
    <div>
      <div>
        Allowance is not enough.{" "}
        <Button isLoading={isApproving} onClick={onMaxApprove}>
          Approve MAX
        </Button>
      </div>
    </div>
  );
};

const validationSchema = yup.object({
  account: yup.string().required(),
  token: yup.string().required(),
  amount: yup.number().required(),
});

const initialValues = {
  account: "",
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

const DepositForm: React.FC = () => {
  const { writeContractAsync } = useWriteContract();
  const { alice, bob } = useAccounts();
  const onSubmit = async (values: any) => {
    const token = tokens[values.token];
    const activeWallet = [alice, bob].find((w) => w.key === values.account);

    try {
      const args = {
        abi: DepositDEX.abi,
        address: DepositDEX.address as Address,
        functionName: "depositCollateral",
        args: [
          values.token,
          parseUnits(values.amount.toString(), token.decimals),
        ],
        account: activeWallet?.account,
      };

      const tx = await writeContractAsync(args);

      toast.success(`Deposited.`);
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <Collapse title="Deposit">
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
        <AccountBalances />
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
        <AllowanceNote />
      </Form>
    </Collapse>
  );
};

export default DepositForm;
