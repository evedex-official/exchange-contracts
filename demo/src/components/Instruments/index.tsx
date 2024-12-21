import React from "react";

import useInstruments from "../../hooks/useInstruments";

import Collapse from "../Collapse";
import FundingRateForm from "../../forms/FundingRateForm";

const Instruments: React.FC = () => {
  const { instruments } = useInstruments();
  return (
    <div>
      <FundingRateForm />
      <Collapse title="Instruments">
        <pre>{JSON.stringify(instruments, null, 2)}</pre>
      </Collapse>
    </div>
  );
};

export default Instruments;
