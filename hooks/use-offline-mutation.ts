/**
 * useOfflineMutation — Wraps a tRPC mutation with automatic offline queue fallback.
 *
 * When online: calls the tRPC mutation directly (normal behavior).
 * When offline: queues the mutation payload for later sync.
 *
 * Usage:
 *   const createGoal = trpc.goals.create.useMutation({ onSuccess: ... });
 *   const offlineCreate = useOfflineMutation("goals.create", createGoal);
 *   // Then call: offlineCreate.mutate(payload) instead of createGoal.mutate(payload)
 */
import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useOfflineQueue, type MutationType } from "@/lib/offline-queue";

interface OfflineMutationOptions {
  /** Custom message shown when mutation is queued offline */
  offlineMessage?: string;
  /** Skip the offline alert (silent queue) */
  silent?: boolean;
  /** Callback after successful online mutation or offline queue */
  onComplete?: () => void;
}

export function useOfflineMutation<TPayload>(
  mutationType: MutationType,
  trpcMutation: { mutate: (payload: TPayload) => void; mutateAsync: (payload: TPayload) => Promise<any> },
  options?: OfflineMutationOptions,
) {
  const { isOnline, addMutation } = useOfflineQueue();

  const mutate = useCallback(
    (payload: TPayload) => {
      if (isOnline) {
        // Online: use normal tRPC mutation (which has its own onSuccess/onError)
        trpcMutation.mutate(payload);
      } else {
        // Offline: queue for later sync
        addMutation(mutationType, payload).then(() => {
          if (!options?.silent) {
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            Alert.alert(
              "Saved Offline",
              options?.offlineMessage || "Your changes will sync automatically when you're back online.",
            );
          }
          options?.onComplete?.();
        });
      }
    },
    [isOnline, trpcMutation, addMutation, mutationType, options],
  );

  const mutateAsync = useCallback(
    async (payload: TPayload): Promise<any> => {
      if (isOnline) {
        return trpcMutation.mutateAsync(payload);
      } else {
        const localId = await addMutation(mutationType, payload);
        if (!options?.silent) {
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          Alert.alert(
            "Saved Offline",
            options?.offlineMessage || "Your changes will sync automatically when you're back online.",
          );
        }
        options?.onComplete?.();
        return { offlineLocalId: localId };
      }
    },
    [isOnline, trpcMutation, addMutation, mutationType, options],
  );

  return { mutate, mutateAsync, isOnline };
}
