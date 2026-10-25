import { CreatorUser } from '../types';
import { supabase } from './supabase';

export interface FriendConnection {
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  status: 'pending' | 'accepted';
  requestedBy: string;
}

async function requireCurrentUser(user: CreatorUser) {
  if (user.isGuest || user.id.startsWith('local-')) {
    throw new Error('Entre com uma conta para adicionar amigos.');
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== user.id) {
    throw error || new Error('Sua sessão expirou. Entre novamente.');
  }
}

export async function fetchFriendConnections(user: CreatorUser): Promise<FriendConnection[]> {
  await requireCurrentUser(user);
  const { data: relations, error } = await supabase
    .from('user_friendships')
    .select('user_low_id,user_high_id,status,requested_by')
    .or(`user_low_id.eq.${user.id},user_high_id.eq.${user.id}`);
  if (error) throw error;
  if (!relations?.length) return [];

  const otherIds = relations.map((relation) =>
    relation.user_low_id === user.id ? relation.user_high_id : relation.user_low_id
  );
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,display_name,username,avatar_url')
    .in('id', otherIds);
  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return relations.flatMap((relation) => {
    const id = relation.user_low_id === user.id ? relation.user_high_id : relation.user_low_id;
    const profile = profilesById.get(id);
    if (!profile) return [];
    return [{
      userId: id,
      displayName: profile.display_name || 'Usuário',
      username: profile.username || undefined,
      avatarUrl: profile.avatar_url || undefined,
      status: relation.status as FriendConnection['status'],
      requestedBy: relation.requested_by,
    }];
  });
}

export async function addOrAcceptFriend(user: CreatorUser, otherUserId: string): Promise<void> {
  await requireCurrentUser(user);
  if (!otherUserId || otherUserId === user.id) throw new Error('Não é possível adicionar sua própria conta.');

  const [userLowId, userHighId] = [user.id, otherUserId].sort();
  const { data: relation, error: lookupError } = await supabase
    .from('user_friendships')
    .select('status,requested_by')
    .eq('user_low_id', userLowId)
    .eq('user_high_id', userHighId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (relation?.status === 'accepted' || relation?.requested_by === user.id) return;

  if (relation) {
    const { error } = await supabase
      .from('user_friendships')
      .update({ status: 'accepted' })
      .eq('user_low_id', userLowId)
      .eq('user_high_id', userHighId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('user_friendships').insert({
    user_low_id: userLowId,
    user_high_id: userHighId,
    requested_by: user.id,
    status: 'pending',
  });
  if (error) throw error;
}
