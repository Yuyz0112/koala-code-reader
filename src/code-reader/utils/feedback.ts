import { eventBus, SharedStorage } from "./storage";

export function getImproveBasicInput(
  params: Pick<SharedStorage, "basic">
): Promise<Pick<SharedStorage, "basic">> {
  return new Promise((resolve) => {
    eventBus.once("improveBasicInput", (data) => {
      resolve(JSON.parse(data) as Pick<SharedStorage, "basic">);
    });

    eventBus.emit(
      "send",
      JSON.stringify({
        type: "improveBasicInput",
        value: params,
      })
    );
  });
}

export function getUserFeedback(
  params: Pick<SharedStorage, "currentFile" | "nextFile">
): Promise<Pick<SharedStorage, "userFeedback">> {
  return new Promise((resolve) => {
    eventBus.once("userFeedback", (data) => {
      resolve(JSON.parse(data) as Pick<SharedStorage, "userFeedback">);
    });

    eventBus.emit(
      "send",
      JSON.stringify({
        type: "userFeedback",
        value: params,
      })
    );
  });
}

export function finishFlow() {
  eventBus.emit(
    "send",
    JSON.stringify({
      type: "finishFlow",
    })
  );
}
