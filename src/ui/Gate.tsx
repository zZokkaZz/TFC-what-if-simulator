// Màn vào app: nhập mã đội + chọn vai trò, hoặc dùng một mình (không đồng bộ).
import { useState } from 'preact/hooks';
import type { Role } from '../sync/types';
import { ROLE_LABEL, TEAM_CODE_RE } from '../sync/types';
import type { Session } from './session';
import { useMockBackend } from './session';

const ROLES: Role[] = ['purchasing', 'ops', 'sales', 'sc', 'viewer'];

export function Gate({ initial, onDone, onCancel }: { initial: Session | null; onDone: (s: Session) => void; onCancel?: () => void }) {
  const [team, setTeam] = useState(initial?.mode === 'team' ? initial.team : '');
  const [role, setRole] = useState<Role>(initial?.role ?? 'ops');
  const [show, setShow] = useState(false);
  const valid = TEAM_CODE_RE.test(team.trim());
  return (
    <div class="gate">
      <div class="gate-card">
        <h2>TFC What-if · vào nhóm</h2>
        <p class="muted">Nhập <b>mã đội</b> (cả nhóm dùng chung) và chọn vai trò của bạn. Mã và vai trò chỉ lưu trên máy này.{useMockBackend() && <b> Đang ở chế độ GIẢ LẬP (?mock=1): đồng bộ giữa các tab trên cùng máy, không dùng Firebase.</b>}</p>
        <label class="field">
          <span class="f-label">Mã đội</span>
          <div class="row">
            <input type={show ? 'text' : 'password'} value={team} autocomplete="off" spellcheck={false} placeholder="tối thiểu 8 ký tự: chữ, số, - _" onInput={(e) => setTeam((e.currentTarget as HTMLInputElement).value)} />
            <button class="btn" type="button" onClick={() => setShow(!show)}>{show ? 'Ẩn' : 'Hiện'}</button>
          </div>
          {!valid && team.length > 0 && <span class="f-hint warn-text">Mã phải dài 8–64 ký tự, chỉ gồm chữ không dấu, số, "-" hoặc "_".</span>}
        </label>
        <div class="field">
          <span class="f-label">Vai trò</span>
          <div class="roles">
            {ROLES.map((r) => (
              <label class={`role-opt${role === r ? ' on' : ''}`}>
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <span class="f-hint">Mỗi vai trò chỉ sửa được ô của phòng mình; vai trò "Xem" chỉ xem.</span>
        </div>
        <div class="row gap">
          <button class="btn primary" disabled={!valid} onClick={() => onDone({ mode: 'team', team: team.trim(), role })}>Vào nhóm</button>
          <button class="btn" onClick={() => onDone({ mode: 'solo', team: '', role: 'ops' })}>Dùng một mình (không đồng bộ)</button>
          {onCancel && <button class="btn" onClick={onCancel}>Hủy</button>}
        </div>
      </div>
    </div>
  );
}
