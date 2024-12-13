import React from "react";
import { toast } from "react-toastify";
import * as yup from "yup";
import { useFormikContext } from "formik";

import Form, { Field } from "../../components/Form";
import { Btc, DepositDEX, Usdt } from "../../contracts";
import { useWriteContract } from "wagmi";
import { Address, parseUnits } from "viem";
import useApprove from "../../hooks/useApprove";
import Button from "../../components/Button";

const AllowanceNote = () => {
  const { values } = useFormikContext<any>();
  const { allowance, onMaxApprove, isApproving } = useApprove(
    values.address as Address,
    DepositDEX.address as Address
  );

  if (!values.address) return null;

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
  address: yup.string().required(),
  amount: yup.number().required(),
});

const initialValues = {
  address: "",
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
  const onSubmit = async (values: any) => {
    const token = tokens[values.address];

    console.log("values", values, token);

    try {
      const tx = await writeContractAsync({
        abi: DepositDEX.abi,
        address: DepositDEX.address as Address,
        functionName: "depositCollateral",
        args: [
          values.address,
          parseUnits(values.amount.toString(), token.decimals),
        ],
      });

      toast.success(`Deposited.`);
    } catch (e) {
      console.error(e);
      toast.error(`Error: ${(e as any).message}`);
    }
  };
  return (
    <Form
      title="Deposit"
      initialValues={initialValues}
      onSubmit={onSubmit}
      validationSchema={validationSchema}
    >
      <Field
        label="Token"
        name="address"
        fieldType="select"
        placeholder="Select"
      >
        <option value={Usdt.address}>USDT</option>
        <option value={Btc.address}>BTC</option>
      </Field>
      <Field label="Amount" name="amount" />
      <AllowanceNote />
    </Form>
  );
};

export default DepositForm;
