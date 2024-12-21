import { useWriteContract } from "wagmi";
import * as yup from "yup";
import { parseUnits } from "viem";
import { toast } from "react-toastify";

import { EveDEX } from "../../contracts";

import useInstruments from "../../hooks/useInstruments";
import useAccounts from "../../hooks/useAccounts";

import Form, { Field } from "../../components/Form";
import Collapse from "../../components/Collapse";

const initialValues = {
  instrument: "",
  frLong: 0.01,
  frShort: 0.01,
  timestamp: Math.trunc(Date.now() / 1000),
};

const validationSchema = yup.object({
  instrument: yup.string().required(),
  frLong: yup.number().required(),
  frShort: yup.number().required(),
  timestamp: yup.number().required(),
});

const FundingRateForm = () => {
  const { instruments } = useInstruments();
  const { writeContractAsync } = useWriteContract();
  const { matcher } = useAccounts();
  const onSubmit = async (values: any) => {
    try {
      const args = {
        address: EveDEX.address,
        abi: EveDEX.abi,
        functionName: "setFR",
        args: [
          values.instrument,
          parseUnits(values.frLong.toString(), 11),
          parseUnits(values.frShort.toString(), 11),
          values.timestamp,
        ],
        account: matcher.wallet,
      };
      const tx = await writeContractAsync(args);
      toast.success(`Fundind rate updated. ${tx}`);
    } catch (e) {
      toast.error((e as any).message);
      console.error(e);
    }
  };
  return (
    <Collapse title="Set Funding Rate">
      <Form
        onSubmit={onSubmit}
        initialValues={initialValues}
        validationSchema={validationSchema}
      >
        <Field
          label="Instrument"
          name="instrument"
          fieldType="select"
          placeholder="Select"
        >
          {instruments.map((i) => (
            <option key={i.index} value={i.index}>
              {i.ticker}
            </option>
          ))}
        </Field>
        <Field label="Funding Rate Long, %" name="frLong" />
        <Field label="Funding Rate Short, %" name="frShort" />
        <Field label="Timestamp" name="timestamp" />
      </Form>
    </Collapse>
  );
};

export default FundingRateForm;
