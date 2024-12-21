import React from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { useFormikContext } from "formik";
import { useWriteContract } from "wagmi";
import { Address, parseUnits } from "viem";

import { DepositDEX } from "../../contracts";

import useApprove from "../../hooks/useApprove";
import useAccounts from "../../hooks/useAccounts";

import Button from "../../components/Button";
import Form, { Field } from "../../components/Form";
import Collapse from "../../components/Collapse";
import useCollaterals from "../../hooks/useCollaterals";
import { Collateral } from "../../helpers/event-horizon-types";

const AllowanceNote = () => {
  const { values } = useFormikContext<any>();
  const { alice, bob, liquidator } = useAccounts();
  const activeAccount = [alice, bob, liquidator].find(
    (w) => w.key === values.account
  );
  const { allowance, onMaxApprove, isApproving } = useApprove({
    account: activeAccount?.wallet,
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

const DepositForm: React.FC = () => {
  const { writeContractAsync } = useWriteContract();
  const { collaterals } = useCollaterals();
  const { alice, bob, liquidator } = useAccounts();
  const accs = [alice, bob, liquidator];
  const onSubmit = async (values: any) => {
    const token = collaterals.find(
      (c: Collateral) => c.address == values.token
    );
    const activeAccount = accs.find((w) => w.key === values.account);

    try {
      const amountWei = parseUnits(values.amount.toString(), token.decimals);
      const args = {
        abi: DepositDEX.abi,
        address: DepositDEX.address as Address,
        functionName: "depositCollateral",
        args: [values.token, amountWei],
        account: activeAccount?.wallet,
      };

      const tx = await writeContractAsync(args);

      toast.success(`Deposited. ${tx}`);
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
          {accs.map((account) => (
            <option key={account.key} value={account.key}>
              {account.key} ({account.wallet.address})
            </option>
          ))}
        </Field>
        <Field
          label="Token"
          name="token"
          fieldType="select"
          placeholder="Select"
        >
          {collaterals.map((c: Collateral) => (
            <option key={c.address} value={c.address}>
              {c.symbol}
            </option>
          ))}
        </Field>
        <Field label="Amount" name="amount" />
        <AllowanceNote />
      </Form>
    </Collapse>
  );
};

export default DepositForm;
