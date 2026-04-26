"""Business model — commercial establishments from OSM."""

import enum

from geoalchemy2 import Geometry
from sqlalchemy import Column, Enum, Float, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class BusinessCategory(str, enum.Enum):
    RESTAURANT = "restaurant"
    CAFE = "cafe"
    BAR = "bar"
    FAST_FOOD = "fast_food"
    GROCERY = "grocery"
    SUPERMARKET = "supermarket"
    CLOTHING = "clothing"
    ELECTRONICS = "electronics"
    BEAUTY_SALON = "beauty_salon"
    BARBERSHOP = "barbershop"
    GYM = "gym"
    HOTEL = "hotel"
    BANK = "bank"
    ATM = "atm"
    FUEL = "fuel"
    CAR_WASH = "car_wash"
    CAR_REPAIR = "car_repair"
    PHARMACY_BIZ = "pharmacy_biz"
    DENTIST = "dentist"
    VETERINARY = "veterinary"
    LAUNDRY = "laundry"
    BAKERY = "bakery"
    BUTCHER = "butcher"
    CONVENIENCE = "convenience"
    MALL = "mall"
    FURNITURE = "furniture"
    HARDWARE = "hardware"
    BOOKSHOP = "bookshop"
    FLORIST = "florist"
    JEWELRY = "jewelry"
    OPTICIAN = "optician"
    MOBILE_PHONE = "mobile_phone"
    COMPUTER = "computer"
    STATIONERY = "stationery"
    TOYS = "toys"
    SPORTS = "sports"
    PET_SHOP = "pet_shop"
    COFFEE_SHOP = "coffee_shop"
    HOOKAH = "hookah"
    NIGHTCLUB = "nightclub"
    COWORKING = "coworking"
    OTHER = "other"


# Human-readable labels
CATEGORY_LABELS: dict[BusinessCategory, str] = {
    BusinessCategory.RESTAURANT: "Рестораны",
    BusinessCategory.CAFE: "Кафе",
    BusinessCategory.BAR: "Бары",
    BusinessCategory.FAST_FOOD: "Фастфуд",
    BusinessCategory.GROCERY: "Продуктовые",
    BusinessCategory.SUPERMARKET: "Супермаркеты",
    BusinessCategory.CLOTHING: "Одежда",
    BusinessCategory.ELECTRONICS: "Электроника",
    BusinessCategory.BEAUTY_SALON: "Салоны красоты",
    BusinessCategory.BARBERSHOP: "Барбершопы",
    BusinessCategory.GYM: "Спортзалы",
    BusinessCategory.HOTEL: "Отели",
    BusinessCategory.BANK: "Банки",
    BusinessCategory.ATM: "Банкоматы",
    BusinessCategory.FUEL: "АЗС",
    BusinessCategory.CAR_WASH: "Автомойки",
    BusinessCategory.CAR_REPAIR: "Автосервисы",
    BusinessCategory.PHARMACY_BIZ: "Аптеки",
    BusinessCategory.DENTIST: "Стоматологии",
    BusinessCategory.VETERINARY: "Ветеринарные",
    BusinessCategory.LAUNDRY: "Прачечные",
    BusinessCategory.BAKERY: "Пекарни",
    BusinessCategory.BUTCHER: "Мясные лавки",
    BusinessCategory.CONVENIENCE: "Мини-маркеты",
    BusinessCategory.MALL: "ТРЦ",
    BusinessCategory.FURNITURE: "Мебель",
    BusinessCategory.HARDWARE: "Стройматериалы",
    BusinessCategory.BOOKSHOP: "Книжные",
    BusinessCategory.FLORIST: "Цветы",
    BusinessCategory.JEWELRY: "Ювелирные",
    BusinessCategory.OPTICIAN: "Оптика",
    BusinessCategory.MOBILE_PHONE: "Сотовые телефоны",
    BusinessCategory.COMPUTER: "Компьютерные",
    BusinessCategory.STATIONERY: "Канцелярия",
    BusinessCategory.TOYS: "Игрушки",
    BusinessCategory.SPORTS: "Спорттовары",
    BusinessCategory.PET_SHOP: "Зоомагазины",
    BusinessCategory.COFFEE_SHOP: "Кофейни",
    BusinessCategory.HOOKAH: "Кальянные",
    BusinessCategory.NIGHTCLUB: "Ночные клубы",
    BusinessCategory.COWORKING: "Коворкинги",
    BusinessCategory.OTHER: "Прочее",
}

# Group categories for UI
CATEGORY_GROUPS: dict[str, list[BusinessCategory]] = {
    "Еда и напитки": [
        BusinessCategory.RESTAURANT, BusinessCategory.CAFE, BusinessCategory.BAR,
        BusinessCategory.FAST_FOOD, BusinessCategory.COFFEE_SHOP, BusinessCategory.BAKERY,
        BusinessCategory.BUTCHER, BusinessCategory.HOOKAH, BusinessCategory.NIGHTCLUB,
    ],
    "Продукты": [
        BusinessCategory.GROCERY, BusinessCategory.SUPERMARKET,
        BusinessCategory.CONVENIENCE, BusinessCategory.MALL,
    ],
    "Красота и здоровье": [
        BusinessCategory.BEAUTY_SALON, BusinessCategory.BARBERSHOP,
        BusinessCategory.GYM, BusinessCategory.DENTIST,
        BusinessCategory.PHARMACY_BIZ, BusinessCategory.VETERINARY,
        BusinessCategory.OPTICIAN,
    ],
    "Товары": [
        BusinessCategory.CLOTHING, BusinessCategory.ELECTRONICS,
        BusinessCategory.FURNITURE, BusinessCategory.HARDWARE,
        BusinessCategory.BOOKSHOP, BusinessCategory.FLORIST,
        BusinessCategory.JEWELRY, BusinessCategory.MOBILE_PHONE,
        BusinessCategory.COMPUTER, BusinessCategory.STATIONERY,
        BusinessCategory.TOYS, BusinessCategory.SPORTS, BusinessCategory.PET_SHOP,
    ],
    "Услуги": [
        BusinessCategory.HOTEL, BusinessCategory.BANK, BusinessCategory.ATM,
        BusinessCategory.FUEL, BusinessCategory.CAR_WASH,
        BusinessCategory.CAR_REPAIR, BusinessCategory.LAUNDRY,
        BusinessCategory.COWORKING,
    ],
}


class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True)
    name = Column(String(500))
    category = Column(Enum(BusinessCategory), nullable=False, index=True)
    osm_id = Column(String(50), unique=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    location = Column(Geometry("POINT", srid=4326))
    address = Column(Text)
    phone = Column(String(100))
    website = Column(String(500))
    opening_hours = Column(String(200))
    cuisine = Column(String(200))  # for restaurants/cafes
    extra_data = Column(Text)
