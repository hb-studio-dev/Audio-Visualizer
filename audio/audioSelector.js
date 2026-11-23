export class AudioSelector {
  constructor(selects) {
    this.selects = selects;
    this.devices = [];
  }

  // Call only after microphone access has been granted on startup. Browsers
  // can hide device labels and all but the default input before permission.
  async refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("Open this page over HTTPS or localhost.");
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices.filter((device) => device.kind === "audioinput");

    for (const select of this.selects) {
      const selectedId = select.value;
      select.replaceChildren();
      for (const [index, device] of this.devices.entries()) {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        select.append(option);
      }
      select.disabled = this.devices.length === 0;
      if (this.devices.some((device) => device.deviceId === selectedId)) {
        select.value = selectedId;
      }
    }
    return this.devices;
  }

  // No deviceId: request microphone permission and the system's default input.
  // With a deviceId: insist on that exact input, never silently substitute one.
  async open(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Open this page over HTTPS or localhost.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("No audio track was returned by the selected input.");
    }

    // 'default' and 'communications' are browser-provided aliases, not IDs
    // that necessarily match the physical device returned by getSettings().
    const actualId = track.getSettings?.().deviceId;
    if (
      deviceId &&
      !["default", "communications"].includes(deviceId) &&
      actualId &&
      actualId !== deviceId
    ) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("The browser opened a different input than the one selected.");
    }
    return stream;
  }

  syncToStream(stream, requestedId) {
    const track = stream.getAudioTracks()[0];
    const actualId = track?.getSettings?.().deviceId;
    const deviceId = [actualId, requestedId].find((id) =>
      this.devices.some((device) => device.deviceId === id),
    );
    if (deviceId !== undefined) {
      for (const select of this.selects) select.value = deviceId;
    }
    return (
      track?.label ||
      this.devices.find((device) => device.deviceId === deviceId)?.label ||
      "Microphone"
    );
  }
}
