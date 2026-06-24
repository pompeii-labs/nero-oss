//! Integration tests for the agent <-> sidecar bridge and its hand-off to the
//! media plane.

mod common;

use common::{Event, Sidecar};
use futures_util::{SinkExt, StreamExt};
use nero_media::InfoEvent;
use std::time::Instant;
use str0m::media::{Direction, MediaKind};
use str0m::{Candidate, Rtc};
use tokio_tungstenite::tungstenite::Message;

/// The whole negotiation path: a real str0m-generated offer sent over the bridge
/// comes back as an SDP answer relayed from the media plane.
#[tokio::test]
async fn real_offer_round_trips_to_an_answer() {
    let mut sidecar = Sidecar::start().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(sidecar.url())
        .await
        .expect("connect");
    assert!(matches!(
        sidecar.next_info().await,
        InfoEvent::BridgeConnected
    ));

    // Stand in for the browser: an offerer with an audio track.
    let mut offerer = Rtc::builder().build(Instant::now());
    offerer
        .add_local_candidate(Candidate::host("127.0.0.1:50001".parse().unwrap(), "udp").unwrap());
    let mut change = offerer.sdp_api();
    change.add_media(MediaKind::Audio, Direction::SendRecv, None, None, None);
    let (offer, _pending) = change.apply().expect("offer");

    let msg = serde_json::json!({
        "t": "peer_open",
        "peer": 5,
        "sdp_offer": offer.to_sdp_string(),
    })
    .to_string();
    ws.send(Message::text(msg)).await.unwrap();

    // The media plane answers; the bridge relays it back over the socket.
    let answer = loop {
        match ws.next().await.expect("ws open").expect("ws frame") {
            Message::Text(text) => {
                let v: serde_json::Value = serde_json::from_str(text.as_str()).unwrap();
                if v["t"] == "peer_answer" {
                    break v["sdp"].as_str().unwrap().to_string();
                }
            }
            _ => {}
        }
    };
    assert!(
        answer.contains("m=audio"),
        "answer carries audio:\n{answer}"
    );
}

#[tokio::test]
async fn rejects_garbage_control_with_a_warning() {
    let mut sidecar = Sidecar::start().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(sidecar.url())
        .await
        .unwrap();
    assert!(matches!(
        sidecar.next_info().await,
        InfoEvent::BridgeConnected
    ));

    ws.send(Message::text(r#"{"t":"bogus"}"#.to_string()))
        .await
        .unwrap();

    match sidecar.next().await {
        Event::Warn(w) => assert!(format!("{w}").contains("bad control message"), "got: {w}"),
        other => panic!("expected a warn event, got {other:?}"),
    }
}

#[tokio::test]
async fn closing_the_client_closes_the_bridge() {
    let mut sidecar = Sidecar::start().await;
    let (mut ws, _) = tokio_tungstenite::connect_async(sidecar.url())
        .await
        .unwrap();
    assert!(matches!(
        sidecar.next_info().await,
        InfoEvent::BridgeConnected
    ));

    ws.close(None).await.unwrap();
    assert!(matches!(sidecar.next_info().await, InfoEvent::BridgeClosed));
}
