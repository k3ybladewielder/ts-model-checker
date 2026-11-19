import type {
  CheckerOptions,
  CheckerProgress,
  VerificationResult,
  VisualSpecIR,
} from "@ts-model-checker/core";

export type WorkerCheckOptions = Pick<
  CheckerOptions,
  "maxStates" | "checkDeadlocks" | "checkLiveness" | "progressInterval"
>;

export type WorkerRequest =
  | {
      readonly type: "CHECK_SPEC";
      readonly requestId: string;
      readonly spec: VisualSpecIR;
      readonly options?: WorkerCheckOptions;
    }
  | {
      readonly type: "CANCEL";
      readonly requestId: string;
    };

export type WorkerResponse =
  | {
      readonly type: "PROGRESS";
      readonly requestId: string;
      readonly progress: CheckerProgress;
    }
  | {
      readonly type: "RESULT";
      readonly requestId: string;
      readonly result: VerificationResult;
    }
  | {
      readonly type: "ERROR";
      readonly requestId: string;
      readonly message: string;
    };
