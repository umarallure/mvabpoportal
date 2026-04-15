/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
}

const json = (status: number, body: unknown) => {
  console.log('[manage-team-members] response', status)
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const getEnv = (key: string) => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') ?? ''
  const [type, token] = auth.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

type CallerContext = {
  userId: string
  centerId: string
  role: string
  adminClient: ReturnType<typeof createClient>
}

const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'publisher_admin', 'publisher_closer'])

const VALID_POSITIONS = new Set(['accounting', 'marketing', 'invoicing', 'intake_team', 'other'])
const VALID_SHIFTS = new Set(['morning', 'afternoon', 'evening', 'full_day'])
const ASSIGNABLE_PUBLISHER_ROLES = new Set(['publisher_admin', 'publisher_closer'])

const authorize = async (
  req: Request
): Promise<({ ok: true } & CallerContext) | { ok: false; res: Response }> => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const token = getBearerToken(req)
  if (!token) return { ok: false, res: json(401, { error: 'Missing Authorization header' }) }

  console.log('[manage-team-members] checking auth user')
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData.user) {
    console.log('[manage-team-members] invalid session', userErr?.message)
    return { ok: false, res: json(401, { error: 'Invalid session' }) }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  console.log('[manage-team-members] checking role for', userData.user.id)
  const { data: profile, error: profileErr } = await adminClient
    .from('app_users')
    .select('role, center_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileErr) {
    console.log('[manage-team-members] role lookup failed', profileErr.message)
    return { ok: false, res: json(500, { error: profileErr.message }) }
  }

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    console.log('[manage-team-members] forbidden', userData.user.email)
    return { ok: false, res: json(403, { error: 'Insufficient permissions' }) }
  }

  if (!profile.center_id) {
    return { ok: false, res: json(400, { error: 'No center assigned to your account' }) }
  }

  return {
    ok: true,
    userId: userData.user.id,
    centerId: profile.center_id,
    role: profile.role,
    adminClient
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    console.log('[manage-team-members] request', req.method, new URL(req.url).pathname)

    const ctx = await authorize(req)
    if (!ctx.ok) return ctx.res
    const { centerId, adminClient, userId } = ctx

    /** Get all publisher-role user IDs in the caller's center */
    const getCenterUserIds = async (): Promise<string[]> => {
      const { data, error } = await adminClient
        .from('app_users')
        .select('user_id')
        .eq('center_id', centerId)
        .in('role', ['publisher_admin', 'publisher_closer'])

      if (error) throw new Error(error.message)
      return (data ?? []).map((row: { user_id: string }) => row.user_id)
    }

    // ── GET: list team members for the caller's center ────────────────────
    if (req.method === 'GET') {
      const userIds = await getCenterUserIds()
      if (!userIds.length) return json(200, { members: [] })

      const { data: members, error: membersErr } = await adminClient
        .from('team_members')
        .select('*')
        .in('publisher_id', userIds)
        .order('full_name', { ascending: true })

      if (membersErr) return json(500, { error: membersErr.message })

      // Enrich with app_users data to indicate portal access
      const { data: appUsers } = await adminClient
        .from('app_users')
        .select('user_id, email, role')
        .in('user_id', userIds)

      const appUserMap = new Map(
        (appUsers ?? []).map((u: { user_id: string; email: string; role: string }) => [u.user_id, u])
      )

      const enrichedMembers = (members ?? []).map((member: Record<string, unknown>) => {
        const appUser = appUserMap.get(member.publisher_id as string) as
          | { user_id: string; email: string; role: string }
          | undefined

        // A member "has portal access" when their publisher_id maps to an
        // app_users record whose email matches the team_members email.
        const hasPortalAccess = Boolean(appUser && appUser.email === member.email)

        return {
          ...member,
          has_portal_access: hasPortalAccess,
          portal_role: hasPortalAccess ? appUser!.role : null
        }
      })

      return json(200, { members: enrichedMembers })
    }

    // ── POST: create a new team member with a real portal account ─────────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))

      const email = String(body?.email ?? '').trim().toLowerCase()
      const password = String(body?.password ?? '')
      const fullName = String(body?.full_name ?? '').trim()
      const phone = body?.phone ? String(body.phone).trim() : null
      const position = String(body?.position ?? '')
      const positionOther = body?.position_other ? String(body.position_other).trim() : null
      const shiftAvailability = String(body?.shift_availability ?? 'full_day')
      const assignedRole = String(body?.role ?? 'publisher_closer')

      if (!email) return json(400, { error: 'Email is required' })
      if (!password) return json(400, { error: 'Password is required' })
      if (password.length < 6) return json(400, { error: 'Password must be at least 6 characters' })
      if (!fullName) return json(400, { error: 'Full name is required' })
      if (!ASSIGNABLE_PUBLISHER_ROLES.has(assignedRole)) return json(400, { error: 'Invalid role' })
      if (!VALID_POSITIONS.has(position)) return json(400, { error: 'Invalid position' })
      if (position === 'other' && !positionOther) return json(400, { error: 'Position description is required when position is "other"' })
      if (!VALID_SHIFTS.has(shiftAvailability)) return json(400, { error: 'Invalid shift availability' })

      // publisher_closer callers can only create publisher_closer accounts
      if (ctx.role === 'publisher_closer' && assignedRole !== 'publisher_closer') {
        return json(403, { error: 'You can only create publisher closer accounts' })
      }

      // 1. Create auth user
      console.log('[manage-team-members] creating auth user', email)
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

      if (createErr || !created.user) {
        return json(500, { error: createErr?.message ?? 'Failed to create user' })
      }

      const newUserId = created.user.id

      // 2. Create app_users record
      const { error: appUserErr } = await adminClient
        .from('app_users')
        .upsert({
          user_id: newUserId,
          email,
          display_name: fullName,
          role: assignedRole,
          center_id: centerId
        })

      if (appUserErr) {
        // Rollback: delete auth user
        console.log('[manage-team-members] app_users failed, rolling back', appUserErr.message)
        await adminClient.auth.admin.deleteUser(newUserId)
        return json(500, { error: appUserErr.message })
      }

      // 3. Create profiles record (graceful)
      const { error: profileErr } = await adminClient
        .from('profiles')
        .upsert({ user_id: newUserId, display_name: fullName }, { onConflict: 'user_id' })

      if (profileErr) {
        console.log('[manage-team-members] WARNING: profiles sync failed', profileErr.message)
      }

      // 4. Create team_members record
      const { data: teamMember, error: teamMemberErr } = await adminClient
        .from('team_members')
        .insert({
          lawyer_id: newUserId,
          publisher_id: newUserId,
          full_name: fullName,
          email,
          phone,
          position,
          position_other: position === 'other' ? positionOther : null,
          shift_availability: shiftAvailability
        })
        .select()
        .single()

      if (teamMemberErr) {
        console.log('[manage-team-members] WARNING: team_members insert failed', teamMemberErr.message)
      }

      console.log('[manage-team-members] team member created', newUserId)
      return json(201, {
        member: teamMember
          ? { ...teamMember, has_portal_access: true, portal_role: assignedRole }
          : null,
        user_id: newUserId
      })
    }

    // ── PATCH: update team member metadata ────────────────────────────────
    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))
      const memberId = String(body?.id ?? '').trim()

      if (!memberId) return json(400, { error: 'Team member ID is required' })

      // Verify member is in same center
      const { data: member, error: memberErr } = await adminClient
        .from('team_members')
        .select('id, publisher_id, email')
        .eq('id', memberId)
        .maybeSingle()

      if (memberErr) return json(500, { error: memberErr.message })
      if (!member) return json(404, { error: 'Team member not found' })

      const centerUserIds = await getCenterUserIds()
      if (!centerUserIds.includes(member.publisher_id)) {
        return json(403, { error: 'Cannot edit team members from another center' })
      }

      // publisher_closer cannot edit publisher_admin members
      if (ctx.role === 'publisher_closer') {
        const { data: targetUser } = await adminClient
          .from('app_users')
          .select('role')
          .eq('user_id', member.publisher_id)
          .maybeSingle()

        if (targetUser?.role === 'publisher_admin') {
          return json(403, { error: 'You cannot edit admin team members' })
        }
      }

      // Handle role change (only publisher_admin / admin / super_admin can do this)
      let newRole: string | undefined
      if (body.role !== undefined) {
        const roleVal = String(body.role)
        if (!ASSIGNABLE_PUBLISHER_ROLES.has(roleVal)) return json(400, { error: 'Invalid role' })
        if (ctx.role === 'publisher_closer') {
          return json(403, { error: 'Only admins can change team member roles' })
        }
        newRole = roleVal
      }

      const patch: Record<string, unknown> = {}
      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim()
      if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone).trim() : null
      if (body.position !== undefined) {
        const pos = String(body.position)
        if (!VALID_POSITIONS.has(pos)) return json(400, { error: 'Invalid position' })
        patch.position = pos
        patch.position_other =
          pos === 'other' && body.position_other ? String(body.position_other).trim() : null
      }
      if (body.shift_availability !== undefined) {
        const shift = String(body.shift_availability)
        if (!VALID_SHIFTS.has(shift)) return json(400, { error: 'Invalid shift availability' })
        patch.shift_availability = shift
      }

      if (Object.keys(patch).length === 0 && !newRole) return json(400, { error: 'No fields to update' })

      // Update team_members fields if any
      let updated: Record<string, unknown> | null = null
      if (Object.keys(patch).length > 0) {
        const { data, error: updateErr } = await adminClient
          .from('team_members')
          .update(patch)
          .eq('id', memberId)
          .select()
          .single()

        if (updateErr) return json(500, { error: updateErr.message })
        updated = data
      } else {
        // No team_members fields to change, fetch current record for response
        const { data } = await adminClient
          .from('team_members')
          .select('*')
          .eq('id', memberId)
          .single()
        updated = data
      }

      // Sync app_users: display_name and/or role
      const appPatch: Record<string, unknown> = {}
      if (patch.full_name) appPatch.display_name = patch.full_name
      if (newRole) appPatch.role = newRole

      if (Object.keys(appPatch).length > 0) {
        const { error: syncErr } = await adminClient
          .from('app_users')
          .update(appPatch)
          .eq('user_id', member.publisher_id)

        if (syncErr) {
          console.log('[manage-team-members] WARNING: app_users sync failed', syncErr.message)
        }
      }

      return json(200, { member: updated })
    }

    // ── DELETE: remove team member (and portal account if applicable) ─────
    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => ({}))
      const memberId = String(body?.id ?? '').trim()

      if (!memberId) return json(400, { error: 'Team member ID is required' })

      const { data: member, error: memberErr } = await adminClient
        .from('team_members')
        .select('id, publisher_id, email')
        .eq('id', memberId)
        .maybeSingle()

      if (memberErr) return json(500, { error: memberErr.message })
      if (!member) return json(404, { error: 'Team member not found' })

      const centerUserIds = await getCenterUserIds()
      if (!centerUserIds.includes(member.publisher_id)) {
        return json(403, { error: 'Cannot delete team members from another center' })
      }

      // Prevent self-deletion
      if (member.publisher_id === userId) {
        return json(400, { error: 'You cannot remove yourself from the team' })
      }

      // publisher_closer cannot delete publisher_admin members
      if (ctx.role === 'publisher_closer') {
        const { data: targetUser } = await adminClient
          .from('app_users')
          .select('role')
          .eq('user_id', member.publisher_id)
          .maybeSingle()

        if (targetUser?.role === 'publisher_admin') {
          return json(403, { error: 'You cannot remove admin team members' })
        }
      }

      // Determine if this team member has their own portal account.
      // For records created via this flow: publisher_id = the member's own user_id,
      // and the app_users email matches the team_members email.
      // For legacy informational records: publisher_id = the creator's user_id,
      // and the emails will differ.
      const { data: publisherUser } = await adminClient
        .from('app_users')
        .select('email')
        .eq('user_id', member.publisher_id)
        .maybeSingle()

      const isSelfOwnedPortalAccount =
        publisherUser && publisherUser.email === member.email

      // 1. Delete team_members record
      const { error: tmDelErr } = await adminClient
        .from('team_members')
        .delete()
        .eq('id', memberId)

      if (tmDelErr) return json(500, { error: tmDelErr.message })

      // 2. If the member has their own portal account, remove it
      if (isSelfOwnedPortalAccount) {
        console.log('[manage-team-members] deleting portal account for', member.publisher_id)

        const { error: appDelErr } = await adminClient
          .from('app_users')
          .delete()
          .eq('user_id', member.publisher_id)

        if (appDelErr) {
          console.log('[manage-team-members] WARNING: app_users delete failed', appDelErr.message)
        }

        const { error: authDelErr } = await adminClient.auth.admin.deleteUser(
          member.publisher_id
        )
        if (authDelErr) {
          console.log('[manage-team-members] WARNING: auth user delete failed', authDelErr.message)
        }
      }

      return json(200, { ok: true })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (e) {
    console.log('[manage-team-members] unhandled error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return json(500, { error: msg })
  }
})
