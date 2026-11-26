"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { ReactNode } from "react";

import toast from "react-hot-toast";

import API from "@/api";
import { useProject } from "@/context/ProjectContext";
import socket from "@/socket/socket";
import useEffectiveTrackingSettings from "@/hooks/useEffectiveTrackingSettings";
import { subscribeDashboardUpdates, useDashboard } from "@/context/DashboardContext";

/*TYPES */

type TimerContextType = {
  timer: any;
  isTracking: boolean;
  isOnBreak: boolean;

  start: (
    userId: string,
    projectId?: string | null,
    taskId?: string | null
  ) => void;

  switchTask: (
    projectId: string | null,
    taskId: string | null
  ) => void;

  stop: (options?: { isBreak?: boolean }) => void;

  finishDay: () => Promise<any>;

  duration: number;

  todayWorkSeconds: number;
  displayedWorkSeconds: number;
  todayBreakSeconds: number;
  displayedBreakSeconds: number;
  finishedToday: boolean;
  refreshTodayWork: () => Promise<void>;
  stats: {
    todaySeconds: number;
    weekSeconds: number;
    monthSeconds: number;
    avgDaySeconds: number;
  };
  refreshStats: () => Promise<void>;
  lastStartedAt: number;
  lastStoppedAt: number;
};

/* CONTEXT */

const TimerContext = createContext<TimerContextType | null>(null);

/* PROVIDER */
type Props = {
  children: ReactNode;
};

export const TimerProvider = ({ children }: Props) => {
  const [timer, setTimer] = useState<any>(null);
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isOnBreak, setIsOnBreak] = useState<boolean>(false);
  const [breakStartedAt, setBreakStartedAt] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [snapshotWorkSeconds, setSnapshotWorkSeconds] = useState(0);
  const [snapshotBreakSeconds, setSnapshotBreakSeconds] = useState(0);
  const [snapshotTimestamp, setSnapshotTimestamp] = useState(0);
  const todayWorkRequestIdRef = useRef(0);

  const [rawStats, setRawStats] = useState({
    todaySeconds: 0,
    weekSeconds: 0,
    monthSeconds: 0,
    avgDaySeconds: 0,
  });
  const [statsSnapshotTimestamp, setStatsSnapshotTimestamp] = useState(0);
  const statsRequestIdRef = useRef(0);
  const durationRef = useRef(0);
  const [lastStoppedAt, setLastStoppedAt] = useState(0);
  const [lastStartedAt, setLastStartedAt] = useState(0);
  const [finishedToday, setFinishedToday] = useState(false);
  const [attendanceChecked, setAttendanceChecked] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(20);
  const autoStarted = useRef(false);

  const isTrackingRef = useRef(false);
  const isOnBreakRef = useRef(false);
  const snapshotWorkSecondsRef = useRef(0);
  const snapshotBreakSecondsRef = useRef(0);
  const lastTaskContextRef = useRef<{
    projectId: string | null;
    taskId: string | null;
  }>({ projectId: null, taskId: null });

  const handlingSleep = useRef(false);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const { user, refreshUser } = useDashboard();
  const currentUserId = user?._id || user?.id;

  const {
    settings: effectiveSettings,
  } = useEffectiveTrackingSettings();

  const refreshStats = useCallback(async () => {
    const reqId = ++statsRequestIdRef.current;
    try {
      const { data } = await API.get("/sessions/stats");
      if (reqId !== statsRequestIdRef.current) return;
      setStatsSnapshotTimestamp(Date.now());
      setRawStats(data);
    } catch (err) {
      console.error("Failed to fetch session stats:", err);
    }
  }, []);

  const stats = useMemo(() => {
    const additional =
      isTracking && statsSnapshotTimestamp
        ? Math.max(0, Math.floor((Date.now() - statsSnapshotTimestamp) / 1000))
        : 0;
    return {
      todaySeconds: (rawStats.todaySeconds || 0) + additional,
      weekSeconds: (rawStats.weekSeconds || 0) + additional,
      monthSeconds: (rawStats.monthSeconds || 0) + additional,
      avgDaySeconds: rawStats.avgDaySeconds || 0,
    };
  }, [rawStats, isTracking, statsSnapshotTimestamp, duration]);

  const refreshTodayWork = useCallback(async () => {
    const reqId = ++todayWorkRequestIdRef.current;
    try {
      const { data } = await API.get("/sessions/today");
      if (reqId !== todayWorkRequestIdRef.current) return;

      setSnapshotWorkSeconds(data.workSeconds || 0);
      setSnapshotBreakSeconds(data.breakSeconds || 0);
      setSnapshotTimestamp(Date.now());
    } catch (err) {
      console.error("Failed to fetch today summary:", err);
    }
  }, []);

  const [breakDuration, setBreakDuration] = useState<number>(0);

  const displayedWorkSeconds = useMemo(() => {
    if (!isTracking || !snapshotTimestamp) {
      return snapshotWorkSeconds;
    }
    const elapsedSinceSnapshot = Math.max(
      0,
      Math.floor((Date.now() - snapshotTimestamp) / 1000)
    );
    return snapshotWorkSeconds + elapsedSinceSnapshot;
  }, [isTracking, snapshotWorkSeconds, snapshotTimestamp, duration]);

  const displayedBreakSeconds = useMemo(() => {
    if (!isOnBreak || !breakStartedAt) {
      return snapshotBreakSeconds;
    }
    const elapsedBreak = Math.max(
      0,
      Math.floor((Date.now() - breakStartedAt) / 1000)
    );
    return snapshotBreakSeconds + elapsedBreak;
  }, [isOnBreak, snapshotBreakSeconds, breakStartedAt, breakDuration]);


  // START
  const start = useCallback((
    userId?: string,
    projectId: string | null = null,
    taskId: string | null = null
  ) => {
    // Tracking can only be controlled by the desktop app.
    if (!window.electronAPI) return;

    if (isTracking) return;

    if (!attendanceChecked) {
      return;
    }

    if (finishedToday) {
      toast.error(
        "You have already finished working for today. You can start again tomorrow."
      );
      return;
    }

    const targetUserId = userId || currentUserId;
    if (!targetUserId) {
      return;
    }

    socket.emit(
      "startTimer",
      {
        userId: targetUserId,
        project: projectId,
        task: taskId,
      },
      (res: any) => {
        if (res?.error) {
          const message =
            typeof res.error === "string"
              ? res.error
              : res.error?.message || "Failed to start timer";
          toast.error(message);
        }
      }
    );
  }, [isTracking, attendanceChecked, finishedToday, currentUserId]);

  useEffect(() => {
    if (!window.electronAPI) return;
    if (!user) return;

    if (!effectiveSettings) return;

    if (!attendanceChecked) return;

    if (finishedToday) {
      toast.error(
        "You have already finished working for today. You can start again tomorrow."
      );
      return;
    }

    const mode = effectiveSettings?.tracking?.trackingMode;

    if (
      mode === "manual" &&
      !effectiveSettings?.tracking?.startTrackingOnBoot
    ) {
      return;
    }

    if (isTracking || timer) return;

    if (autoStarted.current) return;

    autoStarted.current = true;

    start(currentUserId, null, null);

  }, [
    user,
    effectiveSettings,
    timer,
    isTracking,
    start,
    attendanceChecked,
    finishedToday,
  ]);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    isOnBreakRef.current = isOnBreak;
  }, [isOnBreak]);

  useEffect(() => {
    snapshotWorkSecondsRef.current = snapshotWorkSeconds;
  }, [snapshotWorkSeconds]);

  useEffect(() => {
    snapshotBreakSecondsRef.current = snapshotBreakSeconds;
  }, [snapshotBreakSeconds]);

  useEffect(() => {
    if (!user) return;

    const onAutoStart = window.electronAPI?.onAutoStartTracking as
      | ((
          callback: (data?: {
            projectId?: string | null;
            taskId?: string | null;
          }) => void
        ) => (() => void) | void)
      | undefined;

    const removeListener = onAutoStart?.((payload) => {
      if (isTrackingRef.current) return;

      const projectId =
        payload?.projectId !== undefined
          ? payload.projectId
          : lastTaskContextRef.current.projectId;
      const taskId =
        payload?.taskId !== undefined
          ? payload.taskId
          : lastTaskContextRef.current.taskId;

      start(currentUserId, projectId ?? null, taskId ?? null);
    });

    return () => {
      removeListener?.();
    };
  }, [user, currentUserId, start]);

  // SWITCH TASK
  const switchTask = (
    projectId: string | null,
    taskId: string | null
  ) => {
    if (!window.electronAPI) return;

    window.electronAPI.switchTask(
      projectId,
      taskId
    );

    if (!timer?._id) return;

    socket.emit("switchTask", {
      userId: timer.user,
      project: projectId,
      task: taskId,
    });
  };


  // STOP
  const stop = useCallback((options?: { isBreak?: boolean; forceOfflineStop?: boolean }) => {
    if (!window.electronAPI) return;

    const isBreak = Boolean(options?.isBreak);

    if (!timer?._id) {
      if (isOnBreakRef.current && !isBreak) {
        setIsOnBreak(false);
        setBreakStartedAt(0);
        setBreakDuration(0);

        const stopTrackingFn = window.electronAPI.stopTracking as
          | ((opts?: { isBreak?: boolean }) => void)
          | undefined;
        stopTrackingFn?.({ isBreak: false });

        window.electronAPI.updateTrackingBar?.({
          displayedWorkSeconds: snapshotWorkSecondsRef.current,
          displayedBreakSeconds: snapshotBreakSecondsRef.current,
          todayWorkSeconds: snapshotWorkSecondsRef.current,
          todayBreakSeconds: snapshotBreakSecondsRef.current,
          duration: 0,
          isTracking: false,
          isOnBreak: false,
          status: "stopped",
        });

        if (socket.connected) {
          socket.emit("stopTimer", {
            isBreak: false,
            clearBreak: true,
          });
        }
        refreshTodayWork();
      }
      return;
    }

    if (!socket.connected) {
      if (
        options?.forceOfflineStop ||
        effectiveSettings?.tracking?.stopTrackingWithoutInternet
      ) {
        handlingSleep.current = false;
        setTimer(null);
        setIsTracking(false);
        setIsOnBreak(isBreak);
        setBreakStartedAt(isBreak ? Date.now() : 0);
        setBreakDuration(0);
        setDuration(0);
        setSnapshotTimestamp(0);
        setStatsSnapshotTimestamp(0);

        const stopTrackingFn = window.electronAPI.stopTracking as
          | ((opts?: { isBreak?: boolean }) => void)
          | undefined;
        stopTrackingFn?.({ isBreak });

        window.electronAPI.updateTrackingBar?.({
          displayedWorkSeconds: snapshotWorkSecondsRef.current,
          displayedBreakSeconds: snapshotBreakSecondsRef.current,
          todayWorkSeconds: snapshotWorkSecondsRef.current,
          todayBreakSeconds: snapshotBreakSecondsRef.current,
          duration: 0,
          isTracking: false,
          isOnBreak: isBreak,
          status: isBreak ? "break" : "stopped",
        });

        setLastStoppedAt(Date.now());
        socket.connect();
        return;
      }

      toast.error("Connection lost. Reconnecting...");
      socket.connect();
      return;
    }

    socket.emit("stopTimer", {
      timerId: timer._id,
      isBreak,
    });
  }, [timer, refreshTodayWork, effectiveSettings]);

  useEffect(() => {
    if (!user) return;

    const onAutoStop = window.electronAPI?.onAutoStopTracking as
      | ((
          callback: (data?: { reason?: string; appName?: string }) => void
        ) => (() => void) | void)
      | undefined;

    const removeListener = onAutoStop?.((payload) => {
      if (!isTrackingRef.current && !isOnBreakRef.current) return;

      if (payload?.reason === "blacklisted") {
        toast.error(
          `Tracking stopped: "${payload.appName || "Application"}" is blacklisted.`
        );
      } else if (payload?.reason === "offline") {
        toast.error("Internet connection lost. Tracking stopped.");
      }

      stop({
        isBreak: false,
        forceOfflineStop: payload?.reason === "offline",
      });
    });

    return () => {
      removeListener?.();
    };
  }, [user, stop]);

  const finishDay = useCallback(async () => {
    if (finishedToday) {
      toast.error(
        "You have already finished working for today. You can start again tomorrow."
      );
      return null;
    }

    try {
      // If currently tracking or on break, stop completely first so the
      // current session is closed and break accumulation stops before finishing.
      if (isTracking || isOnBreak) {
        stop({ isBreak: false });

        // Give the socket/session save a moment to complete.
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const { data } = await API.post("/attendance/finish");

      setFinishedToday(true);

      // Refresh today's totals after finishing.
      await refreshTodayWork();

      return data.report;
    } catch (err: any) {
      console.error("FINISH DAY ERROR:", err);

      console.error(
        err?.response?.data?.message ||
        "Failed to finish workday"
      );

      return null;
    }
  }, [
    finishedToday,
    isTracking,
    isOnBreak,
    stop,
    refreshTodayWork,
  ]);


  useEffect(() => {
    if (!user?._id) return;

    const getActiveTimer = async () => {
      try {
        const res = await API.get(
          `/timers/active/${user._id}`,
        );

        if (res.data) {
          setTimer(res.data);
          setIsTracking(true);

          const start = new Date(
            res.data.startTime
          ).getTime();

          const now = Date.now();

          setDuration(
            Math.floor((now - start) / 1000)
          );
        } else {
          setTimer(null);
          setIsTracking(false);
          setDuration(0);
        }

        await refreshTodayWork();
        await refreshStats();
      } catch (err) {
        console.error(err);
      }
    };

    getActiveTimer();

    window.electronAPI?.onIdleWarning(() => {
      setIdleCountdown(20);
      setShowIdleModal(true);
    });

    window.electronAPI?.onIdleResumed(() => {

      setShowIdleModal(false);
      setIdleCountdown(20);
    });


    socket.off("timerStarted");
    socket.off("timerStopped");
    socket.off("tracking:started");
    socket.off("tracking:stopped");
    socket.off("timerError");

    const handleTimerError = (err: any) => {
      const message =
        typeof err === "string" ? err : err?.message || "Failed to start timer";
      toast.error(message);
    };

    const handleTimerStarted = (data: any) => {
      const projectId =
        typeof data.project === "string"
          ? data.project
          : data.project?._id || null;
      const taskId =
        typeof data.task === "string" ? data.task : data.task?._id || null;
      lastTaskContextRef.current = { projectId, taskId };

      setTimer(data);
      setIsTracking(true);
      setIsOnBreak(false);
      setBreakStartedAt(0);
      setBreakDuration(0);

      const now = Date.now();
      setSnapshotTimestamp(now);
      setStatsSnapshotTimestamp(now);
      refreshStats();
      refreshTodayWork();

      window.electronAPI?.startTracking(projectId, taskId);

      window.electronAPI?.updateTrackingBar({
        displayedWorkSeconds: snapshotWorkSecondsRef.current,
        displayedBreakSeconds: snapshotBreakSecondsRef.current,
        todayWorkSeconds: snapshotWorkSecondsRef.current,
        todayBreakSeconds: snapshotBreakSecondsRef.current,
        startTime: data.startTime,
        isTracking: true,
        isOnBreak: false,
        status: "working",
      });

      setLastStartedAt(now);
    };

    const handleTimerStopped = (data: any) => {
      handlingSleep.current = false;

      const stoppedForBreak = Boolean(data?.isBreak);
      const now = Date.now();

      setTimer(null);
      setIsTracking(false);
      setIsOnBreak(stoppedForBreak);
      setBreakStartedAt(stoppedForBreak ? now : 0);
      setBreakDuration(0);
      setDuration(0);
      setSnapshotTimestamp(0);
      setStatsSnapshotTimestamp(0);
      refreshStats();
      refreshTodayWork();

      const stopTrackingFn = window.electronAPI?.stopTracking as
        | ((options?: { isBreak?: boolean }) => void)
        | undefined;
      stopTrackingFn?.({ isBreak: stoppedForBreak });

      window.electronAPI?.updateTrackingBar({
        displayedWorkSeconds: snapshotWorkSecondsRef.current,
        displayedBreakSeconds: snapshotBreakSecondsRef.current,
        todayWorkSeconds: snapshotWorkSecondsRef.current,
        todayBreakSeconds: snapshotBreakSecondsRef.current,
        duration: 0,
        isTracking: false,
        isOnBreak: stoppedForBreak,
        status: stoppedForBreak ? "break" : "stopped",
      });

      setLastStoppedAt(now);
    };

    const handleSessionUpdated = () => {
      refreshStats();
      refreshTodayWork();
    };

    const handleSocketReconnect = () => {
      refreshStats();
      refreshTodayWork();
    };

    socket.on("timerStarted", handleTimerStarted);
    socket.on("timerStopped", handleTimerStopped);

    socket.on("tracking:started", handleTimerStarted);
    socket.on("tracking:stopped", handleTimerStopped);
    socket.on("timerError", handleTimerError);
    socket.on("session:updated", handleSessionUpdated);
    socket.on("connect", handleSocketReconnect);

    const cleanupDashboardSync = subscribeDashboardUpdates(refreshUser);

    return () => {
      socket.off("timerStarted", handleTimerStarted);
      socket.off("timerStopped", handleTimerStopped);
      socket.off("tracking:started", handleTimerStarted);
      socket.off("tracking:stopped", handleTimerStopped);
      socket.off("timerError", handleTimerError);
      socket.off("session:updated", handleSessionUpdated);
      socket.off("connect", handleSocketReconnect);
      cleanupDashboardSync();
    };
  }, [user]);

  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(async () => {
      if (handlingSleep.current) return;

      const sleep = await window.electronAPI?.getLastSleep();

      if (!sleep) return;

      const continueDuringSleep = Boolean(
        effectiveSettings?.tracking?.continueTrackingDuringSleep
      );

      if (!continueDuringSleep) {
        if (sleep.sleptMinutes > 0) {
          handlingSleep.current = true;
          stop({ isBreak: false });
        }
        return;
      }

      const allowed =
        (effectiveSettings?.tracking?.sleepBreakHours || 0) * 60 +
        (effectiveSettings?.tracking?.sleepBreakMinutes || 0);

      if (allowed > 0 && sleep.sleptMinutes > allowed) {
        handlingSleep.current = true;

        stop({ isBreak: false });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    isTracking,
    effectiveSettings,
    stop,
  ]);

  useEffect(() => {
    const removeTrackingBarListener =
      window.electronAPI?.onTrackingBarStop(() => {
        stop({ isBreak: false });
      });

    return () => {
      removeTrackingBarListener?.();
    };
  }, [stop]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (isTracking && timer?.startTime) {
      interval = setInterval(() => {
        const seconds = Math.floor(
          (Date.now() - new Date(timer.startTime).getTime()) / 1000
        );

        setDuration(seconds);

        window.electronAPI?.updateTrackingBar({
          displayedWorkSeconds,
          displayedBreakSeconds,
          todayWorkSeconds: displayedWorkSeconds,
          todayBreakSeconds: displayedBreakSeconds,
          startTime: timer.startTime,
          isTracking: true,
          isOnBreak: false,
          status: "working",
        });
      }, 1000);
    } else if (isOnBreak && breakStartedAt) {
      interval = setInterval(() => {
        const seconds = Math.max(
          0,
          Math.floor((Date.now() - breakStartedAt) / 1000)
        );

        setBreakDuration(seconds);

        window.electronAPI?.updateTrackingBar({
          displayedWorkSeconds,
          displayedBreakSeconds,
          todayWorkSeconds: displayedWorkSeconds,
          todayBreakSeconds: displayedBreakSeconds,
          startTime: null,
          isTracking: false,
          isOnBreak: true,
          status: "break",
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [
    isTracking,
    isOnBreak,
    timer,
    breakStartedAt,
    displayedWorkSeconds,
    displayedBreakSeconds,
  ]);

  useEffect(() => {
    if (!showIdleModal) return;

    const interval = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);

          setShowIdleModal(false);

          // Automatically stop tracking into break
          stop({ isBreak: true });

          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showIdleModal, stop]);

  const inactivityMinutes =
    effectiveSettings?.tracking?.inactivityMinutes || 3;

  useEffect(() => {
    const checkTodayAttendance = async () => {
      if (!currentUserId) return;

      try {
        const { data } = await API.get(
          `/attendance/summary/${currentUserId}`
        );

        setFinishedToday(Boolean(data.finishTime));

      } catch (err) {

        // If the check fails, don't assume the day is finished.
        setFinishedToday(false);

      } finally {
        setAttendanceChecked(true);
      }
    };

    checkTodayAttendance();
  }, [currentUserId]);

  return (
    <TimerContext.Provider
      value={{
        timer,
        isTracking,
        isOnBreak,
        start,
        switchTask,
        stop,
        finishDay,
        duration,
        todayWorkSeconds: displayedWorkSeconds,
        displayedWorkSeconds,
        todayBreakSeconds: displayedBreakSeconds,
        displayedBreakSeconds,
        finishedToday,
        refreshTodayWork,
        stats,
        refreshStats,
        lastStartedAt,
        lastStoppedAt,
      }}
    >
      {children}

      {showIdleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] px-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-[420px] shadow-2xl border border-gray-200 dark:border-slate-700">

            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Are you still working?
            </h2>

            <p className="text-gray-600 dark:text-slate-300 mt-3">
              No keyboard or mouse activity has been detected for{" "}
              {inactivityMinutes} minute
              {inactivityMinutes === 1 ? "" : "s"}.
            </p>

            <p className="text-amber-600 dark:text-amber-400 text-lg font-bold mt-4">
              {idleCountdown}s remaining
            </p>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  window.electronAPI?.resetIdle();

                  setIdleCountdown(20);
                  setShowIdleModal(false);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2 rounded-lg text-white font-medium shadow-sm transition-colors"
              >
                Yes, I&apos;m Working
              </button>
            </div>

          </div>
        </div>
      )}

    </TimerContext.Provider>
  );
};

//  HOOK

export const useTimer = () => {
  const context = useContext(TimerContext);

  if (!context) {
    throw new Error("useTimer must be used within TimerProvider");
  }

  return context;

};

export const useOptionalTimer = () => {
  return useContext(TimerContext);
};
