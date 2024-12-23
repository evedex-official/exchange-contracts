import { useWriteContract } from "wagmi";
import { Address, formatUnits, parseUnits } from "viem";
import { toast } from "react-toastify";

import Form, { Field } from "../../components/Form";
import useEveDex from "../../hooks/useEveDex";
import { EveDEX } from "../../contracts";

import useAccounts from "../../hooks/useAccounts";

const BasicParamsForm = () => {
  const { owner } = useAccounts();
  const { isLoading, data } = useEveDex();
  const { writeContractAsync } = useWriteContract();
  const initialValues = {
    liquidationFeePercent: formatUnits(data.liquidationFeePercent, 6),
    maxOpenPositions: parseInt(data.maxOpenPositions),
    soLevel: parseInt(data.soLevel),
    withdrawMarginLevel: parseInt(data.withdrawMarginLevel),
  };
  const onSubmit = async (values: any) => {
    try {
      const args: [
        Address,
        Address,
        Address,
        bigint,
        bigint,
        bigint,
        bigint
      ] = [
        data.depositDex,
        data.sessionManager,
        data.fundingRateAccount,
        values.soLevel,
        values.withdrawMarginLevel,
        values.maxOpenPositions,
        parseUnits(values.liquidationFeePercent.toString(), 6),
      ];
      const tx = await writeContractAsync({
        address: EveDEX.address,
        abi: EveDEX.abi,
        functionName: "setBasicParams",
        args,
        account: owner.wallet,
      });
      toast.success(`Basic params updated. ${tx}`);
    } catch (e) {
      console.error(e);
      toast.error((e as any).message);
    }
  };
  if (isLoading) return null;
  return (
    <Form initialValues={initialValues} onSubmit={onSubmit}>
      <Field
        label="Liquidation Fee, %"
        name="liquidationFeePercent"
        type="number"
        min={0}
        max={100}
      />
      <Field
        label="Maximum Open Positions"
        name="maxOpenPositions"
        type="number"
      />
      <Field label="Stop Out Level" name="soLevel" type="number" />
      <Field
        label="Withdraw Margin Level"
        name="withdrawMarginLevel"
        type="number"
      />
    </Form>
  );
};

export default BasicParamsForm;
