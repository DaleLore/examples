import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
  useMemo,
} from 'react';
import PropTypes from 'prop-types';
import { useDeepCompareMemo } from 'use-deep-compare';

import { sortByKey } from '../lib/sortByKey';

import { useCallState } from './CallProvider';
import {
  ACTIVE_SPEAKER,
  initialParticipantsState,
  PARTICIPANT_JOINED,
  PARTICIPANT_LEFT,
  PARTICIPANT_UPDATED,
  participantsReducer,
  SWAP_POSITION,
} from './participantsState';

export const ParticipantsContext = createContext();

export const ParticipantsProvider = ({ children }) => {
  const { broadcast, callObject } = useCallState();
  const [state, dispatch] = useReducer(
    participantsReducer,
    initialParticipantsState
  );
  const [participantMarkedForRemoval, setParticipantMarkedForRemoval] =
    useState(null);

  /**
   * ALL participants (incl. shared screens) in a convenient array
   */
  const allParticipants = useDeepCompareMemo(
    () => Object.values(state.participants),
    [state?.participants]
  );

  /**
   * Only return participants that should be visible in the call
   */
  const participants = useDeepCompareMemo(
    () =>
      !broadcast
        ? allParticipants
        : allParticipants.filter((p) => p?.isOwner || p?.isScreenshare),
    [broadcast, allParticipants]
  );

  /**
   * The number of participants, who are not a shared screen
   * (technically a shared screen counts as a participant, but we shouldn't tell humans)
   */
  const participantCount = useDeepCompareMemo(
    () => participants.filter(({ isScreenshare }) => !isScreenshare).length,
    [participants]
  );

  /**
   * The participant who most recently got mentioned via a `active-speaker-change` event
   */
  const activeParticipant = useDeepCompareMemo(
    () => participants.find(({ isActiveSpeaker }) => isActiveSpeaker),
    [participants]
  );

  /**
   * The local participant
   */
  const localParticipant = useDeepCompareMemo(
    () =>
      allParticipants.find(
        ({ isLocal, isScreenshare }) => isLocal && !isScreenshare
      ),
    [allParticipants]
  );

  const isOwner = useDeepCompareMemo(
    () => localParticipant?.isOwner,
    [localParticipant]
  );

  /**
   * The participant who should be rendered prominently right now
   */
  const currentSpeaker = useMemo(() => {
    /**
     * Ensure activeParticipant is still present in the call.
     * The activeParticipant only updates to a new active participant so
     * if everyone else is muted when AP leaves, the value will be stale.
     */
    const isPresent = participants.some((p) => p?.id === activeParticipant?.id);

    const displayableParticipants = participants.filter((p) => !p?.isLocal);

    const sorted = displayableParticipants
      .sort((a, b) => sortByKey(a, b, 'lastActiveDate'))
      .reverse();

    return isPresent ? activeParticipant : sorted?.[0] ?? localParticipant;
  }, [activeParticipant, localParticipant, participants]);

  /**
   * Screen shares
   */
  const screens = useDeepCompareMemo(
    () => allParticipants.filter(({ isScreenshare }) => isScreenshare),
    [allParticipants]
  );

  /**
   * The local participant's name
   */
  const username = callObject?.participants()?.local?.user_name ?? '';

  /**
   * Sets the local participant's name in daily-js
   * @param name The new username
   */
  const setUsername = (name) => {
    callObject.setUserName(name);
  };

  const swapParticipantPosition = (id1, id2) => {
    dispatch({
      type: SWAP_POSITION,
      id1,
      id2,
    });
  };

  const handleNewParticipantsState = useCallback(
    (event = null) => {
      switch (event?.action) {
        case 'participant-joined':
          dispatch({
            type: PARTICIPANT_JOINED,
            participant: event.participant,
          });
          break;
        case 'participant-updated':
          dispatch({
            type: PARTICIPANT_UPDATED,
            participant: event.participant,
          });
          break;
        case 'participant-left':
          dispatch({
            type: PARTICIPANT_LEFT,
            participant: event.participant,
          });
          break;
        default:
          break;
      }
    },
    [dispatch]
  );

  /**
   * Start listening for participant changes, when the callObject is set.
   */
  useEffect(() => {
    if (!callObject) return false;

    console.log('👥 Participant provider events bound');

    const events = [
      'joined-meeting',
      'participant-joined',
      'participant-updated',
      'participant-left',
    ];

    // Use initial state
    handleNewParticipantsState();

    // Listen for changes in state
    events.forEach((event) => callObject.on(event, handleNewParticipantsState));

    // Stop listening for changes in state
    return () =>
      events.forEach((event) =>
        callObject.off(event, handleNewParticipantsState)
      );
  }, [callObject, handleNewParticipantsState]);

  useEffect(() => {
    if (!callObject) return false;
    const handleActiveSpeakerChange = ({ activeSpeaker }) => {
      /**
       * Ignore active-speaker-change events for the local user.
       * Our UX doesn't ever highlight the local user as the active speaker.
       */
      const localId = callObject.participants().local.session_id;
      if (localId === activeSpeaker?.peerId) return;

      dispatch({
        type: ACTIVE_SPEAKER,
        id: activeSpeaker?.peerId,
      });
    };
    callObject.on('active-speaker-change', handleActiveSpeakerChange);
    return () =>
      callObject.off('active-speaker-change', handleActiveSpeakerChange);
  }, [callObject]);

  return (
    <ParticipantsContext.Provider
      value={{
        activeParticipant,
        allParticipants,
        currentSpeaker,
        localParticipant,
        participantCount,
        participantMarkedForRemoval,
        participants,
        screens,
        setParticipantMarkedForRemoval,
        setUsername,
        swapParticipantPosition,
        username,
        isOwner,
      }}
    >
      {children}
    </ParticipantsContext.Provider>
  );
};

ParticipantsProvider.propTypes = {
  children: PropTypes.node,
};

export const useParticipants = () => useContext(ParticipantsContext);
