import React from "react";
import { useMatcherState } from "../../providers/MatcherProvider";
import Collapse from "../Collapse";

const Orders: React.FC = () => {
  const { orders } = useMatcherState();
  return (
    <Collapse title="Orders">
      <pre>{JSON.stringify(orders, null, 2)}</pre>
    </Collapse>
  );
};

export default Orders;
