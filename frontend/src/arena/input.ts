import type { Weapon } from './net'

/** 키보드·조이스틱·버튼이 함께 쓰는 입력 상태. React 렌더 없이 매 프레임 읽는다. */
export const input = {
  keys: new Set<string>(),
  joystick: { x: 0, y: 0 },
  /** 누르고 있는 무기 (꾹 누르면 연사) */
  firing: new Set<Weapon>(),
  /** 눌렀다는 사실 자체. 누름과 뗌이 한 프레임 안에 끝나는 짧은 탭도 한 번은 쏘게 한다. */
  tapped: new Set<Weapon>(),
}

export function pressWeapon(weapon: Weapon) {
  input.firing.add(weapon)
  input.tapped.add(weapon)
}

/** 이번 프레임에 쏘려는 무기 목록을 돌려주고 탭 기록을 비운다. */
export function takeWeapons(): Weapon[] {
  const weapons = new Set([...input.firing, ...input.tapped])
  input.tapped.clear()
  return [...weapons]
}

const KEY_WEAPON: Record<string, Weapon> = { KeyJ: 'punch', KeyK: 'gun', Space: 'gun', KeyL: 'missile' }

export function bindKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    input.keys.add(e.code)
    const weapon = KEY_WEAPON[e.code]
    if (weapon) {
      if (!e.repeat) pressWeapon(weapon)
      e.preventDefault()
    }
  }
  const up = (e: KeyboardEvent) => {
    input.keys.delete(e.code)
    const weapon = KEY_WEAPON[e.code]
    if (weapon) input.firing.delete(weapon)
  }
  const blur = () => {
    input.keys.clear()
    input.firing.clear()
  }
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}

/** 이동 방향 (-1~1). 화면 위쪽이 -z. */
export function moveVector(): [number, number] {
  const k = input.keys
  let x = input.joystick.x
  let z = input.joystick.y
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1
  if (k.has('KeyW') || k.has('ArrowUp')) z -= 1
  if (k.has('KeyS') || k.has('ArrowDown')) z += 1
  const length = Math.hypot(x, z)
  return length > 1 ? [x / length, z / length] : [x, z]
}
