import { Gender, GroupRole } from "./common"

/** 陌生人资料 */
export interface StrangerInfo {
	user_id: number
	nickname: string
}

/** 好友资料 */
export interface FriendInfo extends StrangerInfo {
	sex: Gender
	remark: string
	class_id: number
}

/** 群资料 */
export interface GroupInfo {
	group_id: number
	group_name: string
	member_count: number
	max_member_count: number
	owner_id: number
	admin_flag: boolean
	last_join_time: number
	last_sent_time?: number
	shutup_time_whole: number
	shutup_time_me: number
	create_time?: number
	grade?: number
	max_admin_count?: number
	active_member_count?: number
	update_time: number
}

/** 群员资料 */
export interface MemberInfo {
	group_id: number
	user_id: number
	nickname: string
	card: string
	sex: Gender
	age: number
	area?: string
	join_time: number
	last_sent_time: number
	level: number
	rank?: string
	role: GroupRole
	title: string
	title_expire_time: number
	shutup_time: number
	update_time: number
}
