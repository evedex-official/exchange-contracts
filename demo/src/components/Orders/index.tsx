import React from "react";
import { useReadContracts } from "wagmi";
import { toast } from "react-toastify";
import { formatUnits } from "viem";

import { EveDEX } from "../../contracts";
import { BUY_SIDE, SELL_SIDE } from "../../constants";

import { getContractCalls } from "../../helpers";
import {
  InstrumentExtended,
  OrderExtended,
} from "../../helpers/event-horizon-types";

import { useMatcherState } from "../../providers/MatcherProvider";
import useInstruments, {
  useInstrumentsPrices,
} from "../../hooks/useInstruments";
import useFillOrders from "../../hooks/useFillOrders";

import Collapse from "../Collapse";
import Button from "../Button";
import useOrderInfo from "../../hooks/useOrderInfo";
import classNames from "../../helpers/classnames";

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
  const instrumentsPrices = useInstrumentsPrices();
  const { instruments } = useInstruments();
  const instrument = instruments.find((i) => i.index == order.instrumentIndex);
  const {
    data: { filledAmount },
  } = useOrderInfo(order);
  if (!instrument) return null;
  const filledPercent = Number((filledAmount * 100n) / BigInt(order.amount));
  const isFilled = filledPercent === 100;
  return (
    <div className={classNames("order", { "order--filled": isFilled })}>
      <label>
        <input
          type="checkbox"
          disabled={isFilled}
          checked={checked}
          onChange={onSelect}
        />{" "}
        {/* <pre>
        {JSON.stringify(order, null, 2)}
      </pre> */}
        <span>
          {order.side == BUY_SIDE ? "Buy" : "Sell"}{" "}
          {formatUnits(order.amount, instrument.token.decimals)}{" "}
          {instrument.token.symbol} x{order.leverage.toString()} / 1{" "}
          {instrument.token.symbol} {"="} {order.price.toString()}{" "}
          <span>({filledPercent}% filled)</span>
        </span>
      </label>
    </div>
  );
};

type InstrumentOrdersProps = {
  instrument: InstrumentExtended;
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
      {instruments.map((instrument) => {
        const instrumentOrders = orders[instrument.index] || {};
        const buyOrders = instrumentOrders[BUY_SIDE] || [];
        const sellOrders = instrumentOrders[SELL_SIDE] || [];
        return (
          <InstrumentOrders
            key={instrument.index}
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
