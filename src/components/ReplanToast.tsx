import { Icon } from "./Icon";

export interface ReplanMessage {
  id: number;
  direction: "earlier" | "later";
  minutes: number;
  leaveBy: string;
}

interface Props {
  message: ReplanMessage | null;
}

/**
 * Surfaces the app's whole promise the moment it happens: when live traffic
 * moves your recommended departure, a toast announces the shift.
 */
export function ReplanToast({ message }: Props) {
  if (!message) return null;
  const worse = message.direction === "earlier";
  return (
    <div
      key={message.id}
      className={`replan-toast ${worse ? "worse" : "better"}`}
      role="status"
    >
      <span className="replan-icon">
        <Icon name={worse ? "car" : "route"} size={16} />
      </span>
      <span>
        {worse ? "Traffic building" : "Roads clearing"} —{" "}
        <strong>
          leave {message.minutes}m {message.direction}
        </strong>{" "}
        · now {message.leaveBy}
      </span>
    </div>
  );
}
