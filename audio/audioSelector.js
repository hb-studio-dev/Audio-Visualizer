export class AudioSelector {
  constructor(selects) {
    this.selects = selects;
    this.devices = [];
  }

  async refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error("HTTPSまたはlocalhostで開いてください。");
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices.filter((device) => device.kind === "audioinput");
    for (const select of this.selects) {
      const selectedId = select.value;
      select.replaceChildren();
      for (const [index, device] of this.devices.entries()) {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.textContent = device.label || `マイク ${index + 1}`;
        select.append(option);
      }
      select.disabled = this.devices.length === 0;
      if (this.devices.some((device) => device.deviceId === selectedId)) {
        select.value = selectedId;
      }
    }
    return this.devices;
  }

  async open(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("HTTPSまたはlocalhostで開いてください。");
    }
    // ideal は希望条件なので、要求したデバイス以外が選ばれても成功してしまう。
    // exact で一致する入力だけを取得し、存在しなければ失敗として知らせる。
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
      throw new Error("指定したデバイスから音声を取得できませんでした。");
    }
    // Chrome等で deviceId の別名になる「default」「communications」は除外。
    const actualId = track.getSettings?.().deviceId;
    if (
      deviceId &&
      !["default", "communications"].includes(deviceId) &&
      actualId &&
      actualId !== deviceId
    ) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("選択した入力デバイスと実際の入力デバイスが一致しません。");
    }
    return stream;
  }

  syncToStream(stream, requestedId) {
    const track = stream.getAudioTracks()[0];
    const actualId = track?.getSettings?.().deviceId;
    // ブラウザが認識している接続先を、初期画面・設定画面の両方に反映。
    const deviceId = [actualId, requestedId].find((id) =>
      this.devices.some((device) => device.deviceId === id),
    );
    if (deviceId !== undefined) {
      for (const select of this.selects) select.value = deviceId;
    }
    return (
      track?.label ||
      this.devices.find((device) => device.deviceId === deviceId)?.label ||
      "マイク"
    );
  }
}
