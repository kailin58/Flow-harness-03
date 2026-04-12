const { consumeOutbox, getOrder, applyOrderPaidSideEffects } = require("./store");

function startWorker(logger = console) {
  const timer = setInterval(() => {
    const events = consumeOutbox(100);
    for (const evt of events) {
      if (evt.event_type === "OrderPaid") {
        const order = getOrder(evt.aggregate_id);
        if (order) {
          applyOrderPaidSideEffects(order);
          logger.info?.({ event: evt.event_type, order_id: evt.aggregate_id }, "outbox event processed");
        }
      }
    }
  }, 500);

  return () => clearInterval(timer);
}

module.exports = { startWorker };
