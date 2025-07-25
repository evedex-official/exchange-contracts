// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

struct Order {
  uint256 orderId;
  address senderAddress;
  address matcherAddress;
  uint256 instrumentIndex;
  uint256 amount;
  uint256 price;
  bool limited;
  uint16 leverage;
  uint256 creationTime;
  uint8 side;
  address userSession;
  bytes32 merkleRoot;
  bytes32[] merkleProof;
  bytes signature;
}

struct PriceData {
  uint256 index;
  uint256 price;
}

struct MultiOrderLiquidation {
  address accountToLiquidate;
  address liquidator;
  PriceData[] liquidationPrices;
  PriceData[] prices;
  uint16 leverage;
  uint256 liquidationTimestamp;
  uint256 expiration;
  bytes signature;
}

struct OrderLiquidation {
  address accountToLiquidate;
  address liquidator;
  uint256 index;
  PriceData[] prices;
  uint16 leverage;
  uint256 liquidationTimestamp;
  uint256 expiration;
  bytes signature;
}

struct AdlOrderLiquidation {
  address accountToLiquidate;
  address liquidator;
  uint256 index;
  int256 amount;
  PriceData[] prices;
  uint256 collateralIndexLiquidator;
  uint256 collateralIndexToLiquidate;
  uint16 leverageLiquidator;
  uint16 leverageToLiquidate;
}

struct WithdrawalOrder {
  address collateral;
  address account;
  uint256 amount;
  address session;
  uint256 expiration;
  bytes signature;
}

library OrderValidationLib {
  error DifferentInstruments();
  error DifferentMatchers();
  error InstrumentOutOfIndex();
  error InvalidAmount();
  error InvalidDealSide();
  error InvalidTimeline();
  error InvalidLeverage();
  error InvalidMatcher();
  error InvalidPrice();
  error InvalidSignature();
  error InvalidMerkleTree();

  bytes32 public constant HASHED_NAME = keccak256(bytes("EVEDEX"));
  bytes32 public constant HASHED_VERSION = keccak256(bytes("1"));

  bytes32 public constant EIP712_DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

  function buildDomainSeparator() public view returns (bytes32) {
    return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, HASHED_NAME, HASHED_VERSION, block.chainid, address(this)));
  }

  bytes32 public constant ORDER_TYPEHASH =
    keccak256(
      "Order(uint256 orderId,address senderAddress,address matcherAddress,uint256 instrumentIndex,uint256 amount,uint256 price,bool limited,uint16 leverage,uint256 creationTime,uint8 side)"
    );

  bytes32 public constant MULTI_ORDER_TYPEHASH = keccak256("MultiOrder(bytes32 merkleRoot)");

  bytes32 public constant PRICE_INFO_TYPEHASH = keccak256("PriceData(uint256 index,uint256 price)");

  bytes32 public constant MULTI_ORDER_LIQUIDATION_TYPEHASH =
    keccak256(
      "MultiOrderLiquidation(address accountToLiquidate,address liquidator,PriceData[] liquidationPrices,PriceData[] prices,uint16 leverage,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
    );

  bytes32 public constant LIQUIDATION_ORDER_TYPEHASH =
    keccak256(
      "OrderLiquidation(address accountToLiquidate,address liquidator,uint256 index,PriceData[] prices,uint16 leverage,uint256 liquidationTimestamp,uint256 expiration)PriceData(uint256 index,uint256 price)"
    );

  bytes32 public constant WITHDRAWAL_ORDER_TYPEHASH =
    keccak256("OrderWithdrawal(address collateral,address account,uint256 amount,address session,uint256 expiration)");

  function _getOrderTypeValueHash(Order calldata _order) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          ORDER_TYPEHASH,
          _order.orderId,
          _order.senderAddress,
          _order.matcherAddress,
          _order.instrumentIndex,
          _order.amount,
          _order.price,
          _order.limited,
          _order.leverage,
          _order.creationTime,
          _order.side
        )
      );
  }

  function _getOrderHash(Order calldata _order) internal pure returns (bytes32) {
    return keccak256(abi.encode(_order.orderId, _order.senderAddress));
  }

  function _getSettlementHash(
    bytes32 orderA,
    bytes32 orderB,
    uint8 side,
    uint256 amount,
    uint256 price,
    uint256 timestamp
  ) internal pure returns (bytes32) {
    (orderA, orderB) = side == 0 ? (orderA, orderB) : (orderB, orderA);
    return _getSortedSettlementHash(orderA, orderB, amount, price, timestamp);
  }

  function _getSortedSettlementHash(
    bytes32 orderA,
    bytes32 orderB,
    uint256 amount,
    uint256 price,
    uint256 timestamp
  ) internal pure returns (bytes32) {
    return keccak256(abi.encode(orderA, orderB, amount, price, timestamp));
  }

  function _getMultiOrderTypeValueHash(Order calldata _order) internal pure returns (bytes32) {
    return keccak256(abi.encode(MULTI_ORDER_TYPEHASH, _order.merkleRoot));
  }

  function _getPriceDataTypeValueHash(PriceData memory _priceData) internal pure returns (bytes32) {
    return keccak256(abi.encode(PRICE_INFO_TYPEHASH, _priceData.index, _priceData.price));
  }

  function _getMultiLiquidationOrderTypeValueHash(
    MultiOrderLiquidation memory _liquidationOrder
  ) internal pure returns (bytes32) {
    uint256 liquidationPricesLen = _liquidationOrder.liquidationPrices.length;
    bytes32[] memory encodedLiquidationPrices = new bytes32[](liquidationPricesLen);
    for (uint256 i = 0; i < liquidationPricesLen; ++i) {
      encodedLiquidationPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.liquidationPrices[i]);
    }
    uint256 pricesLen = _liquidationOrder.prices.length;
    bytes32[] memory encodedPrices = new bytes32[](pricesLen);
    for (uint256 i = 0; i < pricesLen; ++i) {
      encodedPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.prices[i]);
    }
    return
      keccak256(
        abi.encode(
          MULTI_ORDER_LIQUIDATION_TYPEHASH,
          _liquidationOrder.accountToLiquidate,
          _liquidationOrder.liquidator,
          keccak256(abi.encodePacked(encodedLiquidationPrices)),
          keccak256(abi.encodePacked(encodedPrices)),
          _liquidationOrder.leverage,
          _liquidationOrder.liquidationTimestamp,
          _liquidationOrder.expiration
        )
      );
  }

  function _getLiquidationOrderTypeValueHash(
    OrderLiquidation memory _liquidationOrder
  ) internal pure returns (bytes32) {
    uint256 len = _liquidationOrder.prices.length;
    bytes32[] memory encodedPrices = new bytes32[](len);
    for (uint256 i = 0; i < len; ++i) {
      encodedPrices[i] = _getPriceDataTypeValueHash(_liquidationOrder.prices[i]);
    }
    return
      keccak256(
        abi.encode(
          LIQUIDATION_ORDER_TYPEHASH,
          _liquidationOrder.accountToLiquidate,
          _liquidationOrder.liquidator,
          _liquidationOrder.index,
          keccak256(abi.encodePacked(encodedPrices)),
          _liquidationOrder.leverage,
          _liquidationOrder.liquidationTimestamp,
          _liquidationOrder.expiration
        )
      );
  }

  function _getWithdrawalOrderTypeValueHash(WithdrawalOrder calldata _withdrawalOrder) internal pure returns (bytes32) {
    return
      keccak256(
        abi.encode(
          WITHDRAWAL_ORDER_TYPEHASH,
          _withdrawalOrder.collateral,
          _withdrawalOrder.account,
          _withdrawalOrder.amount,
          _withdrawalOrder.session,
          _withdrawalOrder.expiration
        )
      );
  }

  function getOrderDigest(Order calldata order) public view returns (bytes32) {
    return keccak256(abi.encodePacked("\x19\x01", buildDomainSeparator(), _getOrderTypeValueHash(order)));
  }

  function getMultiOrderDigest(Order calldata order) public view returns (bytes32, bytes32) {
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getMultiOrderTypeValueHash(order))
    );
    bytes32 leaf = keccak256(bytes.concat(_getOrderTypeValueHash(order)));
    return (digest, leaf);
  }

  function _checkTimeline(uint256 past, uint256 future) internal pure {
    if (future < past) revert InvalidTimeline();
  }

  function _checkSignature(address signer, bytes32 digest, bytes calldata signature) internal view {
    if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) revert InvalidSignature();
  }

  function _checkMerkleTree(bytes32[] calldata proof, bytes32 root, bytes32 leaf) internal pure {
    if (!MerkleProof.verify(proof, root, leaf)) revert InvalidMerkleTree();
  }

  function checkLiquidationOrder(OrderLiquidation calldata liquidationOrder, uint256 historyTimestamp) external view {
    _checkTimeline(historyTimestamp, liquidationOrder.expiration);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkLiquidationOrder(
    MultiOrderLiquidation calldata liquidationOrder,
    uint256 historyTimestamp
  ) external view {
    _checkTimeline(historyTimestamp, liquidationOrder.expiration);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getMultiLiquidationOrderTypeValueHash(liquidationOrder))
    );
    _checkSignature(liquidationOrder.liquidator, digest, liquidationOrder.signature);
  }

  function checkWithdrawalOrder(WithdrawalOrder calldata withdrawalOrder, address orderSigner) external view {
    _checkTimeline(block.timestamp, withdrawalOrder.expiration);
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", buildDomainSeparator(), _getWithdrawalOrderTypeValueHash(withdrawalOrder))
    );
    _checkSignature(orderSigner, digest, withdrawalOrder.signature);
  }

  function checkOrderInfo(
    Order calldata fillingOrder,
    Order calldata complimentaryOrder,
    address fillingOrderSigner,
    address complimentaryOrderSigner,
    address sender,
    uint256 filledAmount,
    uint256 filledPrice,
    uint256 instrumentsLength,
    uint256 historyTimestamp
  ) external view returns (bytes32 fillingOrderDigest, bytes32 complimentaryOrderDigest, bytes32 settlementDigest) {
    _checkTimeline(fillingOrder.creationTime, historyTimestamp);
    _checkTimeline(complimentaryOrder.creationTime, historyTimestamp);

    if (fillingOrder.merkleRoot != 0x00) {
      bytes32 fillingOrderLeaf;
      (fillingOrderDigest, fillingOrderLeaf) = getMultiOrderDigest(fillingOrder);
      _checkMerkleTree(fillingOrder.merkleProof, fillingOrder.merkleRoot, fillingOrderLeaf);
    } else {
      fillingOrderDigest = getOrderDigest(fillingOrder);
    }

    if (complimentaryOrder.merkleRoot != 0x00) {
      bytes32 complimentaryOrderLeaf;
      (complimentaryOrderDigest, complimentaryOrderLeaf) = getMultiOrderDigest(complimentaryOrder);
      _checkMerkleTree(complimentaryOrder.merkleProof, complimentaryOrder.merkleRoot, complimentaryOrderLeaf);
    } else {
      complimentaryOrderDigest = getOrderDigest(complimentaryOrder);
    }

    _checkSignature(fillingOrderSigner, fillingOrderDigest, fillingOrder.signature);
    _checkSignature(complimentaryOrderSigner, complimentaryOrderDigest, complimentaryOrder.signature);

    if (fillingOrder.instrumentIndex != complimentaryOrder.instrumentIndex) revert DifferentInstruments();
    if (instrumentsLength <= fillingOrder.instrumentIndex) revert InstrumentOutOfIndex();
    if (!(fillingOrder.matcherAddress == sender && complimentaryOrder.matcherAddress == sender))
      revert DifferentMatchers();
    if (
      (fillingOrder.limited && filledAmount > fillingOrder.amount) ||
      (complimentaryOrder.limited && filledAmount > complimentaryOrder.amount)
    ) revert InvalidAmount();
    (uint256 buyLimitPrice, uint256 sellLimitPrice) = fillingOrder.side == 1
      ? (fillingOrder.price, complimentaryOrder.price)
      : (complimentaryOrder.price, fillingOrder.price);
    if (filledPrice > buyLimitPrice || filledPrice < sellLimitPrice) revert InvalidPrice();
    if (fillingOrder.side == complimentaryOrder.side) revert InvalidDealSide();
    if (fillingOrder.leverage == 0 || complimentaryOrder.leverage == 0) revert InvalidLeverage();
    fillingOrderDigest = _getOrderHash(fillingOrder);
    complimentaryOrderDigest = _getOrderHash(complimentaryOrder);
    settlementDigest = _getSettlementHash(
      fillingOrderDigest,
      complimentaryOrderDigest,
      fillingOrder.side,
      filledAmount,
      filledPrice,
      historyTimestamp
    );
  }
}
