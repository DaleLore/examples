import React, { useState, useCallback } from 'react';
import { CallProvider } from '@dailyjs/shared/contexts/CallProvider';
import { MediaDeviceProvider } from '@dailyjs/shared/contexts/MediaDeviceProvider';
import { ParticipantsProvider } from '@dailyjs/shared/contexts/ParticipantsProvider';
import { TracksProvider } from '@dailyjs/shared/contexts/TracksProvider';
import { UIStateProvider } from '@dailyjs/shared/contexts/UIStateProvider';
import { WaitingRoomProvider } from '@dailyjs/shared/contexts/WaitingRoomProvider';
import PropTypes from 'prop-types';
import App from '../components/App';
import { Intro, NotConfigured } from '../components/Intro';

/**
 * Index page
 * ---
 * - Checks configuration variables are set in local env
 * - Optionally obtain a meeting token from Daily REST API (./pages/api/token)
 * - Set call owner status
 * - Finally, renders the main application loop
 */
export default function Index({
  domain,
  isConfigured = false,
  predefinedRoom = false,
  forceFetchToken = false,
  forceOwner = false,
  asides,
  modals,
  customTrayComponent,
  customAppComponent,
}) {
  const [roomName, setRoomName] = useState(predefinedRoom || '');
  const [fetchingToken, setFetchingToken] = useState(false);
  const [token, setToken] = useState();
  const [tokenError, setTokenError] = useState();

  const getMeetingToken = useCallback(async (room, isOwner = false) => {
    if (!room) {
      return false;
    }

    setFetchingToken(true);

    // Fetch token from serverside method (provided by Next)
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomName: room, isOwner }),
    });
    const resJson = await res.json();

    if (!resJson?.token) {
      setTokenError(resJson?.error || true);
      setFetchingToken(false);
      return false;
    }

    console.log(`🪙 Token received`);

    setFetchingToken(false);
    setToken(resJson.token);

    // Setting room name will change ready state
    setRoomName(room);

    return true;
  }, []);

  const isReady = !!(isConfigured && roomName);

  if (!isReady) {
    return (
      <main>
        {!isConfigured ? (
          <NotConfigured />
        ) : (
          <Intro
            forceFetchToken={forceFetchToken}
            forceOwner={forceOwner}
            title={process.env.PROJECT_TITLE}
            room={roomName}
            error={tokenError}
            fetching={fetchingToken}
            domain={domain}
            onJoin={(room, isOwner, fetchToken) =>
              fetchToken ? getMeetingToken(room, isOwner) : setRoomName(room)
            }
          />
        )}

        <style jsx>{`
          height: 100vh;
          display: grid;
          grid-template-columns: 640px;
          align-items: center;
          justify-content: center;
        `}</style>
      </main>
    );
  }

  /**
   * Main call UI
   */
  return (
    <UIStateProvider
      asides={asides}
      modals={modals}
      customTrayComponent={customTrayComponent}
    >
      <CallProvider domain={domain} room={roomName} token={token}>
        <ParticipantsProvider>
          <TracksProvider>
            <MediaDeviceProvider>
              <WaitingRoomProvider>
                {customAppComponent || <App />}
              </WaitingRoomProvider>
            </MediaDeviceProvider>
          </TracksProvider>
        </ParticipantsProvider>
      </CallProvider>
    </UIStateProvider>
  );
}

Index.propTypes = {
  isConfigured: PropTypes.bool.isRequired,
  predefinedRoom: PropTypes.bool,
  domain: PropTypes.string,
  asides: PropTypes.arrayOf(PropTypes.func),
  modals: PropTypes.arrayOf(PropTypes.func),
  customTrayComponent: PropTypes.node,
  customAppComponent: PropTypes.node,
  forceFetchToken: PropTypes.bool,
  forceOwner: PropTypes.bool,
};

export async function getStaticProps() {
  // Check that both domain and key env vars are set
  const isConfigured =
    !!process.env.DAILY_DOMAIN && !!process.env.DAILY_API_KEY;

  // Have we predefined a room to use?
  const predefinedRoom = process.env.DAILY_ROOM || false;

  // Pass through domain as prop
  return {
    props: {
      domain: process.env.DAILY_DOMAIN || null,
      isConfigured,
      predefinedRoom,
    },
  };
}
