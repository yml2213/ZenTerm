import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SettingsSwitch } from './SettingsComponents'

function SwitchHarness() {
  const [checked, setChecked] = useState(false)
  return <SettingsSwitch checked={checked} onChange={setChecked} label="光标闪烁" />
}

describe('SettingsSwitch', () => {
  it('点击可见开关可以切换状态', async () => {
    const user = userEvent.setup()
    render(<SwitchHarness />)
    const toggle = screen.getByRole('switch', { name: '光标闪烁' })

    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(toggle).toBeChecked()
  })
})
