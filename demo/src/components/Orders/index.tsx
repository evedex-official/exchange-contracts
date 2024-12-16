import React from "react";
import { useMatcherState } from "../../providers/MatcherProvider";
import Collapse from "../Collapse";
import { useReadContracts } from "wagmi";
import { getContractCalls } from "../../helpers";
import { EveDEX } from "../../contracts";
import useInstruments from "../../hooks/useInstruments";
import { BUY_SIDE, SELL_SIDE } from "../../constants";
import { Instrument, OrderExtended } from "../../helpers/event-horizon-types";
import Button from "../Button";
import useFillOrders from "../../hooks/useFillOrders";
import { toast } from "react-toastify";

type OrderProps = {
  order: OrderExtended;
  checked?: boolean;
  onSelect: () => void;
};

const Order: React.FC<OrderProps> = ({
  order: orderExtended,
  checked,
  onSelect,
}) => {
  const { order } = orderExtended;
  return (
    <div>
      <input type="checkbox" checked={checked} onChange={onSelect} />{" "}
      {order.amount.toString()}:{order.price.toString()}
    </div>
  );
};

type InstrumentOrdersProps = {
  instrument: Instrument;
  buyOrders: OrderExtended[];
  sellOrders: OrderExtended[];
};

const InstrumentOrders: React.FC<InstrumentOrdersProps> = ({
  instrument,
  buyOrders,
  sellOrders,
}) => {
  const { fillOrders, isLoading } = useFillOrders();
  const [checkedBuyOrderId, setCheckedBuyOrderId] = React.useState<number>();
  const [checkedSellOrderId, setCheckedSellOrderId] = React.useState<number>();

  const onCheckBuyOrder = (orderId: number) => () => {
    setCheckedBuyOrderId(orderId);
  };

  const onCheckSellOrder = (orderId: number) => () => {
    setCheckedSellOrderId(orderId);
  };

  const onFillOrders = async () => {
    try {
      const buyOrder = buyOrders.find(
        (order) => order.order.orderId === checkedBuyOrderId
      );
      const sellOrder = sellOrders.find(
        (order) => order.order.orderId === checkedSellOrderId
      );

      if (!buyOrder || !sellOrder) throw new Error("Orders not found");

      const tx = await fillOrders(buyOrder, sellOrder);
      toast.success(`Matched: ${tx}`);
    } catch (e) {
      toast.error((e as any).message);
    }
  };

  return (
    <div>
      <h4>{instrument.ticker}</h4>
      <h5>Buy</h5>
      {buyOrders.map((order) => (
        <Order
          key={order.order.orderId}
          checked={checkedBuyOrderId === order.order.orderId}
          onSelect={onCheckBuyOrder(order.order.orderId)}
          order={order}
        />
      ))}
      <h5>Sell</h5>
      {sellOrders.map((order) => (
        <Order
          key={order.order.orderId}
          checked={checkedSellOrderId === order.order.orderId}
          onSelect={onCheckSellOrder(order.order.orderId)}
          order={order}
        />
      ))}

      <Button
        disabled={!checkedBuyOrderId || !checkedSellOrderId}
        onClick={onFillOrders}
        isLoading={isLoading}
      >
        Fill orders
      </Button>
    </div>
  );
};

const useOrders = () => {
  const { orders } = useMatcherState();
  const calls = getContractCalls([], {
    address: EveDEX.address,
    abi: EveDEX.abi,
  });
  const { isLoading } = useReadContracts({
    contracts: calls,
  });

  return {
    orders,
    isLoading,
  };
};

const AllOrders: React.FC = () => {
  const { orders, isLoading } = useOrders();
  const { instruments, isLoading: isLoadingInstruments } = useInstruments();

  return (
    <Collapse title="Orders">
      {Object.keys(instruments).map((instrumentKey) => {
        const instrumentIndex = parseInt(instrumentKey);
        const instrument = instruments[instrumentIndex];
        const instrumentOrders = orders[instrumentIndex] || {};
        const buyOrders = instrumentOrders[BUY_SIDE];
        const sellOrders = instrumentOrders[SELL_SIDE];
        return (
          <InstrumentOrders
            key={instrumentIndex}
            instrument={instrument}
            buyOrders={buyOrders}
            sellOrders={sellOrders}
          />
        );
      })}
    </Collapse>
  );
};

export default AllOrders;
