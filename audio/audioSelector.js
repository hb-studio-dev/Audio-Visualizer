export class AudioSelector {
  constructor(selects) {
    this.selects = selects;
    this.devices = [];
  }
  async refresh() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices.filter((d) => d.kind === "audioinput");
    for (const select of this.selects) {
      const old = select.value;
      select.replaceChildren();
      for (const [index, device] of this.devices.entries()) {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `マイク ${index + 1}`;
        select.append(option);
      }
      select.disabled = !this.devices.length;
      if (this.devices.some((d) => d.deviceId === old)) select.value = old;
    }
    return this.devices;
  }
  async open(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("HTTPSまたはlocalhostで開いてください。");
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
      },
      video: false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }
}
