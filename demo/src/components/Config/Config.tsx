import React from "react";
import { useConfig } from "../../providers/ConfigProvider";
import Accounts from "../Accounts";
import { BaseField } from "../Form";
import Collapse from "../Collapse";

type PricesProps = {
  value: {
    [x: string]: number;
  };
  name: string;
  onChange: (
    name: string,
    value: {
      [x: string]: number;
    }
  ) => void;
};

const Prices: React.FC<PricesProps> = ({ value, name, onChange }) => {
  const handleChange = (e: any) => {
    const { name: _name, value: _value } = e.target;
    onChange(name, {
      ...value,
      [_name]: _value,
    });
  };
  return (
    <div>
      {Object.keys(value).map((key) => (
        <BaseField
          key={key}
          name={key}
          label={key}
          value={value[key]}
          onChange={handleChange}
        />
      ))}
    </div>
  );
};

const Config = () => {
  const { prices, onChange } = useConfig();
  return (
    <div className="config">
      <div className="config-accounts">
        <Accounts />
      </div>
      <div className="config-prices">
        <Collapse title="Prices">
          <Prices value={prices} name="prices" onChange={onChange} />
        </Collapse>
      </div>
    </div>
  );
};

export default Config;
